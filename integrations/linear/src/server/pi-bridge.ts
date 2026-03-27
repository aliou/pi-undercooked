import type { Config } from "./config";
import type { LinearClient } from "./linear-client";
import type { PiSessionManager } from "./pi-session-manager";
import type { SessionStore } from "./session-store";
import type {
  AgentActivityCreateInput,
  AgentEvent,
  AgentSessionEventWebhook,
  SessionState,
} from "./types";
import { normalizePromptedInput } from "./webhook";

/**
 * PiBridge manages bidirectional event mapping between Linear and Pi
 * on a per-session basis. Uses the Pi SDK directly via PiSessionManager
 * instead of subprocess RPC.
 */
export class PiBridge {
  private config: Config;
  private store: SessionStore;
  private piSessionManager: PiSessionManager;
  private linearClient: LinearClient;

  // Tracks active session workers to prevent concurrent processing
  private activeWorkers = new Set<string>();

  // Collected final text for terminal response extraction
  private sessionFinalTexts = new Map<string, string[]>();

  // Accumulated thinking text per session (from thinking_delta events)
  private sessionThinkingBuffers = new Map<string, string>();

  // Stashed formatted parameter strings from tool_execution_start, keyed by toolCallId
  private toolCallParams = new Map<string, string>();

  // Pending elicitation resolvers, keyed by linearSessionId.
  // When the ask_user tool emits an elicitation, the Promise resolver is parked
  // here until the user responds via a prompted webhook.
  private pendingElicitations = new Map<
    string,
    { resolve: (value: string | undefined) => void }
  >();

  constructor(
    config: Config,
    store: SessionStore,
    piSessionManager: PiSessionManager,
    linearClient: LinearClient,
  ) {
    this.config = config;
    this.store = store;
    this.piSessionManager = piSessionManager;
    this.linearClient = linearClient;
  }

  /**
   * Handle a "created" webhook: start a new Pi session.
   */
  async handleCreated(webhook: AgentSessionEventWebhook): Promise<void> {
    const sessionId = webhook.agentSession.id;
    const orgId = webhook.organizationId;
    console.info(
      `[bridge] handleCreated sessionId=${sessionId} orgId=${orgId}`,
    );

    // Get or create session record
    let session = this.store.getSession(sessionId);
    if (
      session &&
      (session.state === "running" || session.state === "aborting")
    ) {
      console.warn(
        `[bridge] Ignoring duplicate created for active session ${sessionId} state=${session.state}`,
      );
      this.store.addSessionEvent(
        sessionId,
        "created_duplicate",
        "warn",
        "Ignoring duplicate created webhook for active session",
      );
      return;
    }

    if (!session) {
      console.info(`[bridge] Creating new session record for ${sessionId}`);
      session = this.store.createSession(
        sessionId,
        orgId,
        webhook.agentSession.issue?.id ?? null,
        webhook.agentSession.issue?.identifier ?? null,
        webhook.agentSession.issue?.title ?? null,
      );
    } else {
      console.info(
        `[bridge] Reusing existing session ${sessionId} (was ${session.state})`,
      );
      // Clear flags from previous run so this session can emit new terminal
      this.store.clearContinuationFlags(sessionId);
    }

    this.store.updateSessionState(sessionId, "running");
    this.store.addSessionEvent(
      sessionId,
      "session_created",
      "info",
      "Session created, starting Pi session",
    );

    // Emit immediate thought (<10s requirement)
    console.info(`[bridge] Emitting initial thought for ${sessionId}`);
    await this.emitActivity(sessionId, orgId, {
      agentSessionId: sessionId,
      content: { type: "thought", body: "Starting work on this issue..." },
    });

    // Start Pi session and send initial prompt
    await this.startPiSession(sessionId, orgId, webhook);
  }

  /**
   * Handle a "prompted" webhook: steer, stop, or follow-up.
   */
  async handlePrompted(webhook: AgentSessionEventWebhook): Promise<void> {
    const sessionId = webhook.agentSession.id;
    const session = this.store.getSession(sessionId);
    console.info(
      `[bridge] handlePrompted sessionId=${sessionId} sessionState=${session?.state ?? "NOT_FOUND"}`,
    );

    if (!session) {
      console.warn(`[bridge] Prompted event for unknown session: ${sessionId}`);
      return;
    }

    // If there is a pending elicitation (ask_user tool waiting for response),
    // resolve it with the user's reply and return.
    const pending = this.pendingElicitations.get(sessionId);
    if (pending) {
      const reply = normalizePromptedInput(webhook);
      console.info(
        `[bridge] Resolving pending elicitation for ${sessionId}: ${reply.slice(0, 100)}`,
      );
      this.pendingElicitations.delete(sessionId);
      pending.resolve(reply);
      return;
    }

    // Track activity ID for dedupe
    if (webhook.agentActivity?.id) {
      this.store.setLastPromptedActivityId(sessionId, webhook.agentActivity.id);
    }

    // Route per mapping doc algorithm
    const signal = webhook.agentActivity?.signal;
    console.info(
      `[bridge] Prompted routing: signal=${signal ?? "none"} state=${session.state} activityId=${webhook.agentActivity?.id ?? "none"}`,
    );

    if (signal === "stop") {
      console.info(`[bridge] Stop signal received for ${sessionId}`);
      await this.handleStop(sessionId, session.organization_id);
      return;
    }

    const state = session.state;
    const hasSession = this.piSessionManager.hasActiveSession(sessionId);

    if (
      state === "running" ||
      state === "aborting" ||
      state === "awaitingInput"
    ) {
      const message = normalizePromptedInput(webhook);
      const isStreaming = this.piSessionManager.isStreaming(sessionId);
      console.info(
        `[bridge] ${isStreaming ? "Steering" : "Prompting"} Pi for ${sessionId}: hasSession=${hasSession} message=${message.slice(0, 100)}`,
      );

      if (hasSession) {
        if (isStreaming) {
          this.piSessionManager.steer(sessionId, message).catch((err) => {
            console.error(
              `[bridge] Failed to steer session ${sessionId}:`,
              err,
            );
          });
        } else {
          // Not streaming, send as a new prompt turn
          void this.runPromptInBackground(
            sessionId,
            session.organization_id,
            message,
          );
        }
        this.store.addSessionEvent(
          sessionId,
          isStreaming ? "steer_sent" : "prompt_sent",
          "info",
          `${isStreaming ? "Steered" : "Prompted"} Pi: ${message.slice(0, 100)}`,
        );
      } else {
        console.warn(`[bridge] No active Pi session for ${sessionId}`);
      }
      return;
    }

    if (state === "completed" || state === "failed") {
      // Continuation: follow-up
      console.info(
        `[bridge] Continuation path for ${sessionId} (was ${state})`,
      );
      await this.handleContinuation(
        sessionId,
        session.organization_id,
        webhook,
      );
      return;
    }

    // Default fallback: steer or prompt
    const message = normalizePromptedInput(webhook);
    console.warn(`[bridge] Fallback for ${sessionId} state=${state}`);
    if (hasSession) {
      const isStreaming = this.piSessionManager.isStreaming(sessionId);
      if (isStreaming) {
        this.piSessionManager.steer(sessionId, message).catch((err) => {
          console.error(
            `[bridge] Fallback steer failed for ${sessionId}:`,
            err,
          );
        });
      } else {
        void this.runPromptInBackground(
          sessionId,
          session.organization_id,
          message,
        );
      }
    } else {
      console.warn(
        `[bridge] No active Pi session for fallback on ${sessionId}`,
      );
    }
  }

  /**
   * Handle stop signal.
   */
  private async handleStop(sessionId: string, orgId: string): Promise<void> {
    this.store.setStopRequested(sessionId, true);
    this.store.updateSessionState(sessionId, "aborting");
    this.store.addSessionEvent(
      sessionId,
      "stop_requested",
      "info",
      "Stop requested by user",
    );

    if (this.piSessionManager.hasActiveSession(sessionId)) {
      this.piSessionManager.abort(sessionId).catch((err) => {
        console.error(`[bridge] Failed to abort session ${sessionId}:`, err);
      });
    }

    // Set a timeout for forced terminal confirmation
    setTimeout(() => {
      const session = this.store.getSession(sessionId);
      if (session && !session.terminal_emitted && session.stop_requested) {
        this.emitTerminal(
          sessionId,
          orgId,
          "response",
          "Stopped at your request.",
        );
      }
    }, this.config.STOP_WAIT_TIMEOUT_MS);
  }

  /**
   * Handle continuation after terminal state.
   */
  private async handleContinuation(
    sessionId: string,
    orgId: string,
    webhook: AgentSessionEventWebhook,
  ): Promise<void> {
    this.store.clearContinuationFlags(sessionId);
    this.store.addSessionEvent(
      sessionId,
      "continuation",
      "info",
      "Continuing session after terminal state",
    );

    await this.emitActivity(sessionId, orgId, {
      agentSessionId: sessionId,
      content: { type: "thought", body: "Continuing work..." },
    });

    const message = normalizePromptedInput(webhook);
    const hasSession = this.piSessionManager.hasActiveSession(sessionId);
    const dbSession = this.store.getSession(sessionId);

    if (hasSession) {
      // Reuse existing AgentSession, start a new turn
      console.info(
        `[bridge] Continuing with existing session for ${sessionId}`,
      );
      void this.runPromptInBackground(sessionId, orgId, message);
    } else if (dbSession?.pi_session_path) {
      // No in-memory session but we have a persisted file -- rehydrate
      console.info(
        `[bridge] Rehydrating session for continuation ${sessionId} from ${dbSession.pi_session_path}`,
      );
      try {
        await this.piSessionManager.rehydrateSession(
          sessionId,
          dbSession.pi_session_path,
          {
            onEvent: (event) => this.handlePiEvent(sessionId, orgId, event),
            onError: (error) => {
              console.error(
                `[bridge] Pi session error for ${sessionId}:`,
                error,
              );
              const s = this.store.getSession(sessionId);
              if (s && !s.terminal_emitted) {
                this.emitTerminal(
                  sessionId,
                  orgId,
                  "error",
                  `Pi session error: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            },
          },
          this.createElicitationHandler(sessionId, orgId),
        );
        void this.runPromptInBackground(sessionId, orgId, message);
      } catch (err) {
        console.error(
          `[bridge] Failed to rehydrate session ${sessionId}:`,
          err,
        );
        // Fall back to creating a fresh session
        await this.startPiSession(sessionId, orgId, webhook);
      }
    } else {
      // No session exists and no persisted file, create a fresh one
      console.info(
        `[bridge] Creating fresh session for continuation ${sessionId}`,
      );
      await this.startPiSession(sessionId, orgId, webhook);
    }
  }

  /**
   * Start a Pi SDK session and send the initial prompt.
   */
  private async startPiSession(
    sessionId: string,
    orgId: string,
    webhook: AgentSessionEventWebhook,
  ): Promise<void> {
    console.info(`[bridge] startPiSession sessionId=${sessionId}`);
    this.sessionFinalTexts.set(sessionId, []);

    try {
      const managed = await this.piSessionManager.startSession(
        sessionId,
        {
          onEvent: (event) => this.handlePiEvent(sessionId, orgId, event),
          onError: (error) => {
            console.error(`[bridge] Pi session error for ${sessionId}:`, error);
            const session = this.store.getSession(sessionId);
            if (session && !session.terminal_emitted) {
              this.emitTerminal(
                sessionId,
                orgId,
                "error",
                `Pi session error: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          },
        },
        this.createElicitationHandler(sessionId, orgId),
      );

      // Persist the session file path so we can rehydrate after restart
      if (managed.session.sessionFile) {
        this.store.updateSessionPiPath(sessionId, managed.session.sessionFile);
      }

      console.info(`[bridge] Pi session started for ${sessionId}`);
      this.store.addSessionEvent(
        sessionId,
        "session_started",
        "info",
        `Pi SDK session created (file: ${managed.session.sessionFile ?? "in-memory"})`,
      );
    } catch (err) {
      console.error(
        `[bridge] Failed to create Pi session for ${sessionId}:`,
        err,
      );
      this.emitTerminal(
        sessionId,
        orgId,
        "error",
        `Failed to start Pi: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    // Build and send the initial prompt (fire-and-forget)
    const message = await this.buildPromptMessage(webhook, orgId);
    console.info(
      `[bridge] Sending initial prompt to Pi for ${sessionId}: ${message.slice(0, 200)}`,
    );
    void this.runPromptInBackground(sessionId, orgId, message);
  }

  /**
   * Run a prompt in the background, catching errors and emitting terminal if needed.
   */
  private runPromptInBackground(
    sessionId: string,
    orgId: string,
    message: string,
  ): Promise<void> {
    this.store.updateSessionState(sessionId, "running");

    return this.piSessionManager.prompt(sessionId, message).catch((err) => {
      console.error(`[bridge] Prompt failed for ${sessionId}:`, err);
      const session = this.store.getSession(sessionId);
      if (session && !session.terminal_emitted) {
        this.emitTerminal(
          sessionId,
          orgId,
          "error",
          `Pi prompt failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  /**
   * Build the prompt message from webhook data.
   */
  private async buildPromptMessage(
    webhook: AgentSessionEventWebhook,
    orgId: string,
  ): Promise<string> {
    const parts: string[] = [];

    // promptContext is at the root of the webhook payload per the Linear SDK
    const promptContext = webhook.promptContext;
    if (promptContext) {
      parts.push(`<promptContext>${promptContext}</promptContext>`);
    }

    const issue = webhook.agentSession.issue;
    if (issue) {
      const issueInfo = [
        issue.identifier ? `Issue: ${issue.identifier}` : null,
        issue.title ? `Title: ${issue.title}` : null,
        issue.team?.name ? `Team: ${issue.team.name}` : null,
        issue.url ? `URL: ${issue.url}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      if (issueInfo) {
        parts.push(`<issue>\n${issueInfo}\n</issue>`);
      }

      if (issue.description?.trim()) {
        parts.push(
          `<issueDescription>\n${issue.description.trim()}\n</issueDescription>`,
        );
      }

      const projectContext = await this.fetchProjectContext(orgId, issue.id);
      if (projectContext) {
        parts.push(projectContext);
      }
    }

    if (webhook.agentSession.comment?.body?.trim()) {
      parts.push(
        `<assignmentComment>\n${webhook.agentSession.comment.body.trim()}\n</assignmentComment>`,
      );
    }

    const guidance = Array.isArray(webhook.guidance)
      ? webhook.guidance
          .map((item) => JSON.stringify(item))
          .filter((item) => item !== "{}")
          .join("\n")
      : typeof webhook.guidance === "string"
        ? webhook.guidance
        : undefined;

    if (guidance?.trim()) {
      parts.push(`<guidance>\n${guidance.trim()}\n</guidance>`);
    }

    if (
      webhook.agentActivity?.content?.type === "prompt" &&
      webhook.agentActivity.content.body
    ) {
      parts.push(webhook.agentActivity.content.body);
    }

    return parts.join("\n\n") || "Start working on this issue.";
  }

  private async fetchProjectContext(
    orgId: string,
    issueId: string,
  ): Promise<string | null> {
    const accessToken = await this.getValidAccessToken(orgId);
    if (!accessToken) {
      return null;
    }

    const project = await this.linearClient.fetchIssueProjectContext(
      accessToken,
      issueId,
    );
    if (!project) {
      return null;
    }

    const lines = [`Project: ${project.name}`];
    if (project.description?.trim()) {
      lines.push(`Description: ${project.description.trim()}`);
    }

    if (project.resources.length > 0) {
      lines.push(
        "Resources:",
        ...project.resources.map(
          (resource) => `- ${resource.label}: ${resource.url}`,
        ),
      );
    }

    return `<projectContext>\n${lines.join("\n")}\n</projectContext>`;
  }

  /**
   * Handle a Pi SDK event and map it to Linear activity.
   */
  private handlePiEvent(
    sessionId: string,
    orgId: string,
    event: AgentEvent,
  ): void {
    // Skip noisy high-frequency events from the log
    if (
      event.type !== "message_update" &&
      event.type !== "tool_execution_update"
    ) {
      console.info(
        `[bridge] Pi event: type=${event.type} session=${sessionId}`,
      );
    }
    const session = this.store.getSession(sessionId);
    if (!session) {
      console.warn(`[bridge] Pi event for unknown session ${sessionId}`);
      return;
    }

    if (session.stop_requested && !isTerminalEvent(event)) {
      console.info(
        `[bridge] Suppressing non-terminal event ${event.type} (stop requested)`,
      );
      return;
    }

    switch (event.type) {
      case "agent_start":
        void this.emitActivity(sessionId, orgId, {
          agentSessionId: sessionId,
          content: { type: "thought", body: "Working on it..." },
          ephemeral: true,
        });
        break;

      case "tool_execution_start":
        this.handleToolStart(sessionId, orgId, event);
        break;

      case "tool_execution_end":
        this.handleToolEnd(sessionId, orgId, event);
        break;

      case "message_update":
        this.handleMessageUpdate(sessionId, orgId, event);
        break;

      case "message_end":
        this.handleMessageEnd(sessionId, event);
        break;

      case "agent_end":
        this.handleAgentEnd(sessionId, orgId, event);
        break;

      case "turn_start":
      case "turn_end":
      case "message_start":
      case "tool_execution_update":
        break;

      default:
        console.warn(
          `[bridge] Unknown Pi event type: ${(event as { type: string }).type}`,
        );
        this.store.addSessionEvent(
          sessionId,
          "unknown_pi_event",
          "warn",
          `Unknown Pi event type: ${(event as { type: string }).type}`,
        );
    }
  }

  private handleToolStart(
    sessionId: string,
    orgId: string,
    event: Extract<AgentEvent, { type: "tool_execution_start" }>,
  ): void {
    const parameter = event.args
      ? formatToolArgs(event.toolName, event.args as Record<string, unknown>)
      : event.toolName;

    // Stash the formatted parameter so handleToolEnd can reuse it
    this.toolCallParams.set(event.toolCallId, parameter);

    void this.emitActivity(sessionId, orgId, {
      agentSessionId: sessionId,
      content: {
        type: "action",
        action: toolActionLabel(event.toolName, "start"),
        parameter,
      },
      ephemeral: true,
    });
  }

  private handleToolEnd(
    sessionId: string,
    orgId: string,
    event: Extract<AgentEvent, { type: "tool_execution_end" }>,
  ): void {
    const rawText = extractToolResultText(event.result);
    // Retrieve the formatted parameter from the matching start event
    const parameter =
      this.toolCallParams.get(event.toolCallId) ?? event.toolName;
    this.toolCallParams.delete(event.toolCallId);

    // Send both success and error results as action activities so they
    // render as collapsible tool call rows in Linear. Reserve the error
    // activity type for bridge/session-level failures only.
    // Use ```text language tag so Linear does not try to auto-detect syntax.
    const sliceLen = event.isError ? 500 : 1000;
    const result =
      rawText.length > 0
        ? `\`\`\`text\n${rawText.slice(0, sliceLen)}\n\`\`\``
        : event.isError
          ? "```text\nunknown error\n```"
          : "completed";

    // Use human-friendly verb forms per Linear docs ("Reading" -> "Read")
    const action = event.isError
      ? toolActionLabel(event.toolName, "failed")
      : toolActionLabel(event.toolName, "end");

    void this.emitActivity(sessionId, orgId, {
      agentSessionId: sessionId,
      content: {
        type: "action",
        action,
        parameter,
        result,
      },
    });
  }

  /**
   * Handle message_update events, specifically thinking traces.
   * Accumulates thinking_delta text and emits a thought activity on thinking_end.
   */
  private handleMessageUpdate(
    sessionId: string,
    orgId: string,
    event: Extract<AgentEvent, { type: "message_update" }>,
  ): void {
    const ame = event.assistantMessageEvent;

    if (ame.type === "thinking_start") {
      this.sessionThinkingBuffers.set(sessionId, "");
    } else if (ame.type === "thinking_delta") {
      const current = this.sessionThinkingBuffers.get(sessionId) ?? "";
      this.sessionThinkingBuffers.set(sessionId, current + ame.delta);
    } else if (ame.type === "thinking_end") {
      const thinking = this.sessionThinkingBuffers.get(sessionId) ?? "";
      this.sessionThinkingBuffers.delete(sessionId);

      if (thinking.length > 0) {
        void this.emitActivity(sessionId, orgId, {
          agentSessionId: sessionId,
          content: {
            type: "thought",
            body: thinking.slice(0, 2000),
          },
        });
      }
    }
  }

  private handleMessageEnd(
    sessionId: string,
    event: Extract<AgentEvent, { type: "message_end" }>,
  ): void {
    // Collect final assistant text candidates only.

    const texts = this.sessionFinalTexts.get(sessionId) ?? [];
    const msg = event.message;
    if (
      msg.role === "assistant" &&
      "content" in msg &&
      Array.isArray(msg.content)
    ) {
      for (const block of msg.content) {
        if (
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "text" &&
          "text" in block &&
          typeof block.text === "string"
        ) {
          texts.push(block.text);
        }
      }
    }
    this.sessionFinalTexts.set(sessionId, texts);
  }

  private handleAgentEnd(
    sessionId: string,
    orgId: string,
    event: Extract<AgentEvent, { type: "agent_end" }>,
  ): void {
    const session = this.store.getSession(sessionId);
    if (!session) return;

    const terminal = this.extractTerminalResult(sessionId, event);

    if (session.stop_requested) {
      this.emitTerminal(
        sessionId,
        orgId,
        "response",
        "Stopped at your request.",
      );
    } else {
      this.emitTerminal(sessionId, orgId, terminal.type, terminal.body);
    }

    // Cleanup state (keep Pi session alive for potential continuation)
    this.sessionFinalTexts.delete(sessionId);
  }

  /**
   * Extract terminal output following the mapping doc's algorithm, while
   * treating assistant-side model/provider failures as terminal errors.
   */
  private extractTerminalResult(
    sessionId: string,
    agentEndEvent: Extract<AgentEvent, { type: "agent_end" }>,
  ): { type: "response" | "error"; body: string } {
    // 1. Collected from assistant message_end events only
    const collected = this.sessionFinalTexts.get(sessionId) ?? [];
    if (collected.length > 0) {
      return { type: "response", body: collected[collected.length - 1] ?? "" };
    }

    // 2. Check agent_end.messages for assistant text or assistant errors
    for (const msg of agentEndEvent.messages) {
      if (msg.role !== "assistant") {
        continue;
      }

      if ("content" in msg && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && "text" in block && block.text) {
            return { type: "response", body: block.text };
          }
        }
      }

      if (
        "errorMessage" in msg &&
        typeof msg.errorMessage === "string" &&
        msg.errorMessage.trim().length > 0
      ) {
        return {
          type: "error",
          body: `Pi session failed: ${msg.errorMessage}`,
        };
      }
    }

    // 3. Fallback
    return { type: "response", body: "Work completed." };
  }

  /**
   * Emit a terminal activity (response or error) exactly once.
   */
  private emitTerminal(
    sessionId: string,
    orgId: string,
    type: "response" | "error",
    body: string,
  ): void {
    const session = this.store.getSession(sessionId);
    if (session?.terminal_emitted) {
      console.warn(
        `[bridge] Terminal already emitted for ${sessionId}, skipping`,
      );
      return;
    }

    console.info(
      `[bridge] Emitting terminal ${type} for ${sessionId}: ${body.slice(0, 200)}`,
    );
    this.store.setTerminalEmitted(sessionId, true);
    const newState: SessionState = type === "response" ? "completed" : "failed";
    this.store.updateSessionState(sessionId, newState);

    void this.emitActivity(sessionId, orgId, {
      agentSessionId: sessionId,
      content: { type, body },
    });

    this.store.addSessionEvent(
      sessionId,
      `terminal_${type}`,
      type === "error" ? "error" : "info",
      body.slice(0, 500),
    );
  }

  /**
   * Persist and post an activity to Linear.
   */
  private async emitActivity(
    sessionId: string,
    orgId: string,
    input: AgentActivityCreateInput,
  ): Promise<void> {
    const sequence = this.store.getNextSequence(sessionId);
    console.info(
      `[bridge] Emitting activity: session=${sessionId} seq=${sequence} type=${input.content.type}`,
    );
    this.store.insertOutboundActivity(
      sessionId,
      sequence,
      input.content.type,
      input,
    );

    const accessToken = await this.getValidAccessToken(orgId);
    if (!accessToken) {
      console.error(
        `[bridge] No valid access token for org ${orgId}, cannot emit activity: session=${sessionId} seq=${sequence}`,
      );
      this.store.incrementOutboundAttempt(sessionId, sequence);
      return;
    }

    let remoteId = await this.linearClient.createActivity(accessToken, input);

    if (!remoteId) {
      const refreshedToken = await this.getValidAccessToken(orgId, true);
      if (refreshedToken && refreshedToken !== accessToken) {
        remoteId = await this.linearClient.createActivity(
          refreshedToken,
          input,
        );
      }
    }

    if (remoteId) {
      console.info(
        `[bridge] Activity posted to Linear: session=${sessionId} seq=${sequence} remoteId=${remoteId}`,
      );
      this.store.markOutboundPosted(sessionId, sequence, remoteId);
    } else {
      console.error(
        `[bridge] Failed to post activity to Linear: session=${sessionId} seq=${sequence}`,
      );
      this.store.incrementOutboundAttempt(sessionId, sequence);
    }
  }

  /**
   * Get an access token for an organization, refreshing it when needed.
   */
  private async getValidAccessToken(
    orgId: string,
    forceRefresh: boolean = false,
  ): Promise<string | null> {
    const token = this.store.getToken(orgId);
    if (!token) return null;

    const refreshBufferMs = 5 * 60 * 1000;
    const isExpiredOrExpiring =
      token.expires_at != null &&
      token.expires_at <= Date.now() + refreshBufferMs;

    if (!forceRefresh && !isExpiredOrExpiring) {
      return token.access_token;
    }

    if (!token.refresh_token) {
      return forceRefresh ? null : token.access_token;
    }

    const refreshed = await this.refreshAccessToken(orgId, token.refresh_token);
    return (
      refreshed?.access_token ?? (forceRefresh ? null : token.access_token)
    );
  }

  private async refreshAccessToken(
    orgId: string,
    refreshToken: string,
  ): Promise<{ access_token: string } | null> {
    try {
      const response = await fetch("https://api.linear.app/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: this.config.LINEAR_CLIENT_ID,
          client_secret: this.config.LINEAR_CLIENT_SECRET,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(
          `[bridge] Failed to refresh OAuth token for org ${orgId}: ${response.status} ${body}`,
        );
        return null;
      }

      const tokenData = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };

      const expiresAt = tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1000
        : null;

      this.store.upsertToken(
        orgId,
        tokenData.access_token,
        tokenData.refresh_token ?? refreshToken,
        tokenData.scope ?? null,
        expiresAt,
      );

      console.info(`[bridge] Refreshed OAuth token for org ${orgId}`);
      return { access_token: tokenData.access_token };
    } catch (error) {
      console.error(
        `[bridge] OAuth token refresh error for org ${orgId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Process pending webhook events for a session.
   * Acquires a worker lock to prevent concurrent processing.
   */
  async processSession(sessionId: string): Promise<void> {
    if (this.activeWorkers.has(sessionId)) {
      console.info(
        `[bridge] processSession: already processing ${sessionId}, skipping`,
      );
      return;
    }

    this.activeWorkers.add(sessionId);
    console.info(`[bridge] processSession: acquired lock for ${sessionId}`);

    try {
      const events = this.store.getPendingWebhookEvents(sessionId);
      console.info(
        `[bridge] processSession: ${events.length} pending events for ${sessionId}`,
      );

      for (const event of events) {
        try {
          const webhook = JSON.parse(event.payload) as AgentSessionEventWebhook;
          console.info(
            `[bridge] processSession: processing event ${event.dedupe_key} action=${webhook.action}`,
          );

          if (webhook.action === "created") {
            await this.handleCreated(webhook);
          } else if (webhook.action === "prompted") {
            await this.handlePrompted(webhook);
          }

          this.store.markWebhookEventProcessed(event.dedupe_key);
          console.info(
            `[bridge] processSession: event ${event.dedupe_key} processed`,
          );
        } catch (err) {
          console.error(
            `[bridge] processSession: failed to process event ${event.dedupe_key}:`,
            err,
          );
          this.store.markWebhookEventFailed(event.dedupe_key);
        }
      }
    } finally {
      this.activeWorkers.delete(sessionId);
      console.info(`[bridge] processSession: released lock for ${sessionId}`);
    }
  }

  /**
   * Replay pending outbound activities (for crash recovery).
   */
  async replayPendingOutbound(sessionId: string): Promise<void> {
    const pending = this.store.getPendingOutboundActivities(sessionId);
    const session = this.store.getSession(sessionId);
    if (!session) return;

    const token = await this.getValidAccessToken(session.organization_id);
    if (!token) return;

    for (const activity of pending) {
      const input = JSON.parse(activity.payload) as AgentActivityCreateInput;
      let remoteId = await this.linearClient.createActivity(token, input);

      if (!remoteId) {
        const refreshedToken = await this.getValidAccessToken(
          session.organization_id,
          true,
        );
        if (refreshedToken && refreshedToken !== token) {
          remoteId = await this.linearClient.createActivity(
            refreshedToken,
            input,
          );
        }
      }

      if (remoteId) {
        this.store.markOutboundPosted(sessionId, activity.sequence, remoteId);
      } else {
        this.store.incrementOutboundAttempt(sessionId, activity.sequence);
      }
    }
  }

  /**
   * Handle issue unassignment: stop all active sessions for an issue.
   */
  async handleUnassigned(issueId: string, orgId: string): Promise<void> {
    const activeSessions = this.store.findActiveSessionsByIssueId(issueId);
    console.info(
      `[bridge] handleUnassigned issueId=${issueId} activeSessions=${activeSessions.length}`,
    );

    for (const session of activeSessions) {
      const sessionId = session.linear_session_id;
      console.info(
        `[bridge] Stopping session ${sessionId} due to unassignment`,
      );
      this.store.addSessionEvent(
        sessionId,
        "unassigned",
        "info",
        "Issue unassigned, stopping session",
      );
      await this.handleStop(sessionId, orgId);
    }
  }

  /**
   * Rehydrate sessions from disk on startup.
   * Restores in-memory AgentSession instances for sessions that have a
   * persisted session file, so they can handle continuations without
   * losing conversation history.
   */
  async rehydrateSessions(): Promise<void> {
    const sessions = this.store.getRehydratableSessions();
    if (sessions.length === 0) {
      console.info("[bridge] No sessions to rehydrate");
      return;
    }

    console.info(
      `[bridge] Rehydrating ${sessions.length} session(s) from disk`,
    );

    for (const session of sessions) {
      const sessionId = session.linear_session_id;
      const orgId = session.organization_id;
      const filePath = session.pi_session_path;

      if (!filePath) continue;

      try {
        await this.piSessionManager.rehydrateSession(
          sessionId,
          filePath,
          {
            onEvent: (event) => this.handlePiEvent(sessionId, orgId, event),
            onError: (error) => {
              console.error(
                `[bridge] Pi session error for rehydrated ${sessionId}:`,
                error,
              );
            },
          },
          this.createElicitationHandler(sessionId, orgId),
        );
        this.store.addSessionEvent(
          sessionId,
          "rehydrated",
          "info",
          `Session rehydrated from ${filePath}`,
        );
        console.info(
          `[bridge] Rehydrated session ${sessionId} from ${filePath}`,
        );
      } catch (err) {
        console.warn(
          `[bridge] Failed to rehydrate session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.store.addSessionEvent(
          sessionId,
          "rehydrate_failed",
          "warn",
          `Failed to rehydrate: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.piSessionManager.disposeAll();
  }

  /**
   * Create an elicitation handler for a session.
   * When the ask_user tool calls this, it emits a Linear elicitation activity
   * and parks a Promise until the user responds via a prompted webhook.
   */
  private createElicitationHandler(
    sessionId: string,
    orgId: string,
  ): (body: string) => Promise<string | undefined> {
    return (body: string) => {
      void this.emitActivity(sessionId, orgId, {
        agentSessionId: sessionId,
        content: { type: "elicitation", body },
      });

      return new Promise<string | undefined>((resolve) => {
        this.pendingElicitations.set(sessionId, { resolve });
      });
    };
  }
}
// ---- Helpers ----

function isTerminalEvent(event: AgentEvent): boolean {
  return event.type === "agent_end";
}

function formatToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): string {
  // Concise tool description for Linear
  if (toolName === "bash" && typeof args.command === "string") {
    return args.command.slice(0, 200);
  }
  if (toolName === "read" && typeof args.path === "string") {
    return args.path;
  }
  if (toolName === "write" && typeof args.path === "string") {
    return args.path;
  }
  if (toolName === "edit" && typeof args.path === "string") {
    return args.path;
  }
  if (toolName === "grep" && typeof args.pattern === "string") {
    return args.pattern;
  }
  if (toolName === "find" && typeof args.pattern === "string") {
    return args.pattern;
  }
  return JSON.stringify(args).slice(0, 200);
}

/**
 * Map tool names to human-friendly verb forms for Linear action activities.
 * Linear's docs recommend present participle for in-progress ("Reading")
 * and past tense for completed ("Read file").
 */
function toolActionLabel(
  toolName: string,
  phase: "start" | "end" | "failed",
): string {
  const labels: Record<string, { start: string; end: string; failed: string }> =
    {
      bash: {
        start: "Running command",
        end: "Ran command",
        failed: "Command failed",
      },
      read: { start: "Reading", end: "Read", failed: "Read failed" },
      write: { start: "Writing", end: "Wrote", failed: "Write failed" },
      edit: { start: "Editing", end: "Edited", failed: "Edit failed" },
      grep: { start: "Searching", end: "Searched", failed: "Search failed" },
      find: {
        start: "Finding files",
        end: "Found files",
        failed: "Find failed",
      },
    };

  const entry = labels[toolName];
  if (entry) return entry[phase];

  // Fallback for unknown tools
  if (phase === "start") return `Running ${toolName}`;
  if (phase === "failed") return `${toolName} failed`;
  return `Ran ${toolName}`;
}

/**
 * Extract human-readable text from a tool execution result.
 *
 * The SDK returns results as { content: [{ type: "text", text: "..." }], details: {...} }.
 * We extract the text content blocks and join them.
 */
function extractToolResultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";

  const r = result as Record<string, unknown>;

  // SDK format: { content: [{ type: "text", text: "..." }] }
  if (Array.isArray(r.content)) {
    const texts: string[] = [];
    for (const block of r.content) {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        texts.push(block.text);
      }
    }
    if (texts.length > 0) {
      return texts.join("\n");
    }
  }

  // Fallback: stringify
  return JSON.stringify(result).slice(0, 1000);
}
