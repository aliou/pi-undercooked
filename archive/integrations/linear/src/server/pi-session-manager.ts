import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getModel } from "@mariozechner/pi-ai";
import {
  type AgentSession,
  type AgentSessionEvent,
  AuthStorage,
  type CreateAgentSessionOptions,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { createAskUserTool, type ElicitationHandler } from "./ask-user-tool";
import type { AgentEvent } from "./types";

// Resolve system prompt path relative to this file's compiled location.
// tsup bundles into dist/server/, so the .txt file needs to be copied there too.
const SYSTEM_PROMPT_PATH = join(
  import.meta.dirname ?? __dirname,
  "system-prompt.txt",
);

type SessionHandlers = {
  onEvent: (event: AgentEvent) => void;
  onError: (error: unknown) => void;
};

export type ManagedPiSession = {
  linearSessionId: string;
  session: AgentSession;
  unsubscribe: () => void;
  disposed: boolean;
};

/**
 * Manages Pi SDK AgentSession instances, one per Linear session.
 *
 * Each Linear session gets its own in-process AgentSession with event
 * subscription, prompt/steer/abort capabilities, and explicit disposal.
 *
 * Sessions are persisted to disk so conversation history survives bridge
 * restarts. The session file path is stored in the DB and used to rehydrate
 * sessions on startup.
 */
export class PiSessionManager {
  private sessions = new Map<string, ManagedPiSession>();
  private systemPrompt: string | undefined;
  private sessionsDir: string;

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;

    // Ensure the sessions directory exists
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
      console.info(
        `[pi-session-manager] Created sessions directory: ${this.sessionsDir}`,
      );
    }

    // Load system prompt once at construction
    try {
      this.systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
      console.info(
        `[pi-session-manager] Loaded system prompt from ${SYSTEM_PROMPT_PATH}`,
      );
    } catch {
      console.warn(
        `[pi-session-manager] No system prompt found at ${SYSTEM_PROMPT_PATH}`,
      );
    }
  }

  /**
   * Create a new AgentSession for a Linear session and subscribe to its events.
   * The session is persisted to a file in the sessions directory.
   *
   * Returns the managed session. The caller should store `session.sessionFile`
   * in the DB for later rehydration.
   */
  async startSession(
    linearSessionId: string,
    handlers: SessionHandlers,
    onElicitation?: ElicitationHandler,
  ): Promise<ManagedPiSession> {
    // Dispose existing session if any
    const existing = this.sessions.get(linearSessionId);
    if (existing && !existing.disposed) {
      console.info(
        `[pi-session-manager] Disposing existing session for ${linearSessionId}`,
      );
      await this.disposeSession(linearSessionId);
    }

    const sessionManager = SessionManager.create("/app", this.sessionsDir);
    return this.createAndSubscribe(
      linearSessionId,
      sessionManager,
      handlers,
      onElicitation,
    );
  }

  /**
   * Rehydrate a session from an existing session file on disk.
   * Used on startup to restore sessions that were active before the bridge
   * restarted. The session retains its full conversation history.
   */
  async rehydrateSession(
    linearSessionId: string,
    sessionFilePath: string,
    handlers: SessionHandlers,
    onElicitation?: ElicitationHandler,
  ): Promise<ManagedPiSession> {
    if (!existsSync(sessionFilePath)) {
      throw new Error(
        `Session file not found for rehydration: ${sessionFilePath}`,
      );
    }

    const sessionDir = dirname(sessionFilePath);
    const sessionManager = SessionManager.open(sessionFilePath, sessionDir);
    return this.createAndSubscribe(
      linearSessionId,
      sessionManager,
      handlers,
      onElicitation,
    );
  }

  /**
   * Shared logic for creating an AgentSession (new or rehydrated) and
   * subscribing to its events.
   */
  private async createAndSubscribe(
    linearSessionId: string,
    sessionManager: SessionManager,
    handlers: SessionHandlers,
    onElicitation?: ElicitationHandler,
  ): Promise<ManagedPiSession> {
    const model = getModel("openrouter", "anthropic/claude-sonnet-4.6");
    if (!model) {
      throw new Error(
        "Could not find model openrouter/anthropic/claude-sonnet-4.6",
      );
    }

    const authStorage = AuthStorage.create();
    const modelRegistry = new ModelRegistry(authStorage);

    const hasAuth = await authStorage.hasAuth("openrouter");
    if (!hasAuth) {
      throw new Error(
        "No OpenRouter API key found. Set OPENROUTER_API_KEY in the environment.",
      );
    }

    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 3 },
    });

    const loaderOptions: ConstructorParameters<
      typeof DefaultResourceLoader
    >[0] = {
      cwd: "/app",
      settingsManager,
      additionalExtensionPaths: ["git:github.com/aliou/pi-linear"],
    };

    if (this.systemPrompt) {
      const prompt = this.systemPrompt;
      loaderOptions.systemPromptOverride = () => prompt;
    }

    const loader = new DefaultResourceLoader(loaderOptions);
    await loader.reload();

    const loadedExtensions = loader.getExtensions();
    if (loadedExtensions.errors.length > 0) {
      console.warn(
        "[pi-session-manager] Extension load warnings:",
        loadedExtensions.errors,
      );
    }

    const sessionOptions: CreateAgentSessionOptions = {
      model,
      thinkingLevel: "low",
      authStorage,
      modelRegistry,
      sessionManager,
      settingsManager,
      resourceLoader: loader,
      customTools: onElicitation ? [createAskUserTool(onElicitation)] : [],
    };

    const { session } = await createAgentSession(sessionOptions);

    // Subscribe to all events and forward to bridge handlers.
    // session.subscribe emits AgentSessionEvent which is a superset of AgentEvent.
    // We filter out session-level events (compaction, retry) and only forward AgentEvent.
    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      if (
        event.type === "auto_compaction_start" ||
        event.type === "auto_compaction_end" ||
        event.type === "auto_retry_start" ||
        event.type === "auto_retry_end"
      ) {
        return;
      }
      try {
        handlers.onEvent(event as AgentEvent);
      } catch (err) {
        console.error(
          `[pi-session-manager] Event handler error for ${linearSessionId}:`,
          err,
        );
      }
    });

    const managed: ManagedPiSession = {
      linearSessionId,
      session,
      unsubscribe,
      disposed: false,
    };

    this.sessions.set(linearSessionId, managed);
    console.info(
      `[pi-session-manager] Session created for ${linearSessionId} (file: ${session.sessionFile ?? "in-memory"})`,
    );
    console.info(
      `[pi-session-manager] Loaded ${loadedExtensions.extensions.length} extension(s) for ${linearSessionId}`,
    );

    return managed;
  }

  /**
   * Send a prompt to start a new agent turn.
   * This is async and resolves when the agent finishes the turn.
   */
  async prompt(linearSessionId: string, message: string): Promise<void> {
    const managed = this.sessions.get(linearSessionId);
    if (!managed || managed.disposed) {
      throw new Error(
        `No active session for ${linearSessionId} to send prompt`,
      );
    }

    await managed.session.prompt(message);
  }

  /**
   * Steer the agent during streaming (interrupt current work).
   */
  async steer(linearSessionId: string, message: string): Promise<void> {
    const managed = this.sessions.get(linearSessionId);
    if (!managed || managed.disposed) {
      console.warn(
        `[pi-session-manager] No active session for ${linearSessionId} to steer`,
      );
      return;
    }

    if (!managed.session.isStreaming) {
      console.warn(
        `[pi-session-manager] Session ${linearSessionId} not streaming, sending as prompt instead`,
      );
      await managed.session.prompt(message);
      return;
    }

    await managed.session.steer(message);
  }

  /**
   * Abort the current agent operation.
   */
  async abort(linearSessionId: string): Promise<void> {
    const managed = this.sessions.get(linearSessionId);
    if (!managed || managed.disposed) {
      console.warn(
        `[pi-session-manager] No active session for ${linearSessionId} to abort`,
      );
      return;
    }

    await managed.session.abort();
  }

  /**
   * Get a managed session by Linear session ID.
   */
  getSession(linearSessionId: string): ManagedPiSession | undefined {
    return this.sessions.get(linearSessionId);
  }

  /**
   * Check if a session exists and is not disposed.
   */
  hasActiveSession(linearSessionId: string): boolean {
    const managed = this.sessions.get(linearSessionId);
    return managed != null && !managed.disposed;
  }

  /**
   * Check if a session is currently streaming.
   */
  isStreaming(linearSessionId: string): boolean {
    const managed = this.sessions.get(linearSessionId);
    return managed != null && !managed.disposed && managed.session.isStreaming;
  }

  /**
   * Dispose a single session, cleaning up resources.
   */
  async disposeSession(linearSessionId: string): Promise<void> {
    const managed = this.sessions.get(linearSessionId);
    if (!managed) return;

    if (!managed.disposed) {
      managed.unsubscribe();
      managed.session.dispose();
      managed.disposed = true;
    }

    this.sessions.delete(linearSessionId);
    console.info(
      `[pi-session-manager] Session disposed for ${linearSessionId}`,
    );
  }

  /**
   * Dispose all sessions. Called during shutdown.
   */
  async disposeAll(): Promise<void> {
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      await this.disposeSession(id);
    }
  }

  /**
   * Count of active (non-disposed) sessions.
   */
  activeCount(): number {
    let count = 0;
    for (const managed of this.sessions.values()) {
      if (!managed.disposed) count++;
    }
    return count;
  }
}
