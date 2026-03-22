import { LanguageModelSession, SystemLanguageModel } from "tsfm-sdk";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ProviderConfig } from "@mariozechner/pi-coding-agent";
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
} from "@mariozechner/pi-ai";

const MODEL_ID = "apple-on-device";
const MODEL_NAME = "Apple On-Device (Foundation Models)";
const PROVIDER_NAME = "apple";

// A custom api string is required to register a streamSimple handler.
// It must not collide with any KnownApi value.
const API_NAME: Api = "apple-foundation-models";

// ─── Conversation conversion ──────────────────────────────────────────────────

/**
 * Extract the plain text from a user message content, which can be either a
 * string or an array of content blocks.
 */
function extractUserText(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text" && "text" in c)
    .map((c) => c.text)
    .join("");
}

/**
 * Convert the Pi context (system prompt + messages) into the tsfm
 * instructions + prompt pair.
 *
 * Apple Foundation Models do not have a multi-turn transcript API accessible
 * from a single stateless call, so prior turns are serialised into the prompt
 * as a Human/Assistant dialogue. For a single user message, the content is
 * passed verbatim.
 */
function buildPrompt(context: Context): { instructions: string | undefined; prompt: string } {
  const instructions = context.systemPrompt;
  const messages = context.messages;

  if (messages.length === 0) {
    return { instructions, prompt: "" };
  }

  if (messages.length === 1 && messages[0].role === "user") {
    return {
      instructions,
      prompt: extractUserText(messages[0].content as string | { type: string; text?: string }[]),
    };
  }

  // Multi-turn: flatten all turns into a single string.
  const lines: string[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push(`Human: ${extractUserText(msg.content as string | { type: string; text?: string }[])}`);
    } else if (msg.role === "assistant") {
      const text = (msg.content as { type: string; text?: string }[])
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");
      lines.push(`Assistant: ${text}`);
    }
  }

  return { instructions, prompt: lines.join("\n") };
}

// ─── Stream function ──────────────────────────────────────────────────────────

/**
 * The streamSimple handler Pi calls for every generation request.
 *
 * Pi passes the full conversation context (system prompt + all prior messages)
 * and expects an AssistantMessageEventStream in return. We translate the context
 * into a tsfm session call and push the resulting deltas as pi-ai events.
 */
function streamApple(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const eventStream = createAssistantMessageEventStream();

  const baseMessage: AssistantMessage = {
    role: "assistant",
    content: [],
    api: API_NAME,
    provider: PROVIDER_NAME,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };

  // Run the async inference in the background. Errors are caught and emitted
  // as stream error events rather than propagating as unhandled rejections.
  void (async () => {
    let nativeModel: SystemLanguageModel | null = null;
    let session: LanguageModelSession | null = null;

    try {
      if (options?.signal?.aborted) {
        const aborted: AssistantMessage = { ...baseMessage, stopReason: "aborted" };
        eventStream.push({ type: "error", reason: "aborted", error: aborted });
        eventStream.end(aborted);
        return;
      }

      nativeModel = new SystemLanguageModel();
      const { available } = await nativeModel.waitUntilAvailable();

      if (!available) {
        const errorMsg = "Apple Intelligence is not available. Enable it in System Settings > Apple Intelligence & Siri.";
        const errMessage: AssistantMessage = {
          ...baseMessage,
          content: [{ type: "text", text: errorMsg }],
          stopReason: "error",
          errorMessage: errorMsg,
        };
        eventStream.push({ type: "error", reason: "error", error: errMessage });
        eventStream.end(errMessage);
        return;
      }

      const { instructions, prompt } = buildPrompt(context);

      session = new LanguageModelSession({ instructions: instructions ?? undefined });

      // Cancel the tsfm session when Pi's abort signal fires.
      options?.signal?.addEventListener("abort", () => {
        session?.cancel();
      });

      // Build up the partial AssistantMessage as streaming progresses.
      let accumulated = "";
      const startPartial: AssistantMessage = {
        ...baseMessage,
        content: [{ type: "text", text: "" }],
      };

      eventStream.push({ type: "start", partial: startPartial });
      eventStream.push({ type: "text_start", contentIndex: 0, partial: startPartial });

      for await (const delta of session.streamResponse(prompt)) {
        if (options?.signal?.aborted) break;

        accumulated += delta;
        const partial: AssistantMessage = {
          ...baseMessage,
          content: [{ type: "text", text: accumulated }],
        };
        eventStream.push({ type: "text_delta", contentIndex: 0, delta, partial });
      }

      const stopReason = options?.signal?.aborted ? "aborted" : "stop";
      const finalMessage: AssistantMessage = {
        ...baseMessage,
        content: [{ type: "text", text: accumulated }],
        stopReason,
      };

      if (stopReason === "aborted") {
        eventStream.push({ type: "error", reason: "aborted", error: finalMessage });
        eventStream.end(finalMessage);
      } else {
        eventStream.push({
          type: "text_end",
          contentIndex: 0,
          content: accumulated,
          partial: finalMessage,
        });
        eventStream.push({ type: "done", reason: "stop", message: finalMessage });
        eventStream.end(finalMessage);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errMessage: AssistantMessage = {
        ...baseMessage,
        content: [{ type: "text", text: errorMsg }],
        stopReason: "error",
        errorMessage: errorMsg,
      };
      eventStream.push({ type: "error", reason: "error", error: errMessage });
      eventStream.end(errMessage);
    } finally {
      session?.dispose();
      nativeModel?.dispose();
    }
  })();

  return eventStream;
}

// ─── Provider registration ────────────────────────────────────────────────────

const providerConfig: ProviderConfig = {
  // The custom api string links registerProvider to the streamSimple handler.
  // Pi will call streamSimple instead of making any HTTP requests.
  api: API_NAME,
  streamSimple: streamApple,

  // baseUrl and apiKey are required by Pi's validation when models are defined,
  // even when streamSimple handles all actual requests. These values are never
  // used in practice.
  baseUrl: "https://placeholder.apple.local",
  apiKey: "not-required",

  models: [
    {
      id: MODEL_ID,
      name: MODEL_NAME,
      reasoning: false,
      input: ["text"],
      // On-device inference has no monetary cost.
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      // Apple documents the system model context window as 4,096 tokens:
      // https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models
      //
      // We report a much larger value to Pi so its compaction logic does not
      // fire — the real limit applies per tsfm session and tsfm will throw
      // ExceededContextWindowSizeError if a prompt exceeds it.
      contextWindow: 131072,
      maxTokens: 4096,
    },
  ],
};

// ─── Entry point ──────────────────────────────────────────────────────────────

// Deviation from standard pattern: no config file. This extension has no
// user-configurable settings. The provider is always registered unconditionally.

export default function (pi: ExtensionAPI): void {
  pi.registerProvider(PROVIDER_NAME, providerConfig);
}
