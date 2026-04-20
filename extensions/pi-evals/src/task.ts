/**
 * Pi task execution via createAgentSession SDK
 */

import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  type SessionStats as PiSessionStats,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { PiConfig, SessionStats, TestSetup, ToolCall } from "./types";

/**
 * Result of running a pi task
 */
export interface TaskResult {
  /** Agent's final response text */
  output: string;
  /** Full conversation messages */
  messages: unknown[];
  /** Tool calls made during the session */
  toolCalls: ToolCall[];
  /** Session statistics */
  stats: SessionStats;
  /** Workspace directory (for scorers) */
  cwd: string;
}

/**
 * Run a pi task in a temporary workspace
 */
export async function runPiTask(
  input: string,
  config: PiConfig,
  setup?: TestSetup,
  timeout?: number,
): Promise<TaskResult> {
  // Create isolated workspace
  const cwd = await createWorkspace(setup);

  // Create resource loader with extensions if configured.
  // github-models auto-loads a bundled provider extension.
  let resourceLoader: DefaultResourceLoader | undefined;
  const extensionPaths = [
    ...(config.extensions ?? []),
    ...(config.provider === "github-models"
      ? [resolveBundledGithubModelsExtension()]
      : []),
  ];

  if (extensionPaths.length > 0) {
    const resolvedPaths = Array.from(new Set(extensionPaths)).map((ext) =>
      path.resolve(ext),
    );
    resourceLoader = new DefaultResourceLoader({
      cwd,
      additionalExtensionPaths: resolvedPaths,
    });
    await resourceLoader.reload();
  }

  // Create session with in-memory session manager to avoid polluting user sessions
  const { session } = await createAgentSession({
    cwd,
    sessionManager: SessionManager.inMemory(cwd),
    ...(resourceLoader ? { resourceLoader } : {}),
  });

  try {
    const model = session.modelRegistry.find(config.provider, config.model);
    if (!model) {
      throw new Error(
        `Model not found: ${config.provider}/${config.model}. ` +
          `If this is a custom provider, load its extension via config.extensions.`,
      );
    }
    await session.setModel(model);

    // Set up timeout
    const timeoutMs = timeout ?? 60_000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Task timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    // Subscribe to events to know when done
    const completionPromise = new Promise<void>((resolve) => {
      session.subscribe((event) => {
        if (event.type === "agent_end") {
          resolve();
        }
      });
    });

    // Send the prompt
    await session.prompt(input);

    // Wait for completion or timeout
    await Promise.race([completionPromise, timeoutPromise]);

    // Get results
    const messages = session.messages;
    const piStats = session.getSessionStats();

    // Extract the last assistant message text
    const output = extractLastAssistantText(messages);

    // Extract tool calls from messages
    const toolCalls = extractToolCalls(messages);

    // Convert stats
    const stats = convertStats(piStats);

    return {
      output,
      messages,
      toolCalls,
      stats,
      cwd,
    };
  } finally {
    // Dispose session
    session.dispose();
  }
}

/**
 * Extract the text from the last assistant message
 */
function extractLastAssistantText(messages: unknown[]): string {
  // Find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: string; content?: unknown };
    if (msg.role === "assistant") {
      // Extract text from content
      const content = msg.content;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const block of content) {
          if (typeof block === "string") {
            texts.push(block);
          } else if (block && typeof block === "object" && "text" in block) {
            texts.push(String((block as { text: unknown }).text));
          }
        }
        return texts.join("\n");
      }
    }
  }
  return "";
}

/**
 * Extract tool calls from assistant messages.
 * The pi SDK uses content blocks with type "toolCall" (name + arguments),
 * while the raw Anthropic format uses "tool_use" (name + input).
 * We support both for robustness.
 */
function extractToolCalls(messages: unknown[]): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  for (const msg of messages) {
    const message = msg as { role?: string; content?: unknown };
    if (message.role !== "assistant") continue;

    const content = message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      const b = block as {
        type?: string;
        name?: string;
        input?: unknown;
        arguments?: unknown;
      };
      if (b.type === "toolCall" && b.name) {
        toolCalls.push({
          name: b.name,
          args: (b.arguments as Record<string, unknown>) ?? {},
        });
      } else if (b.type === "tool_use" && b.name) {
        toolCalls.push({
          name: b.name,
          args: (b.input as Record<string, unknown>) ?? {},
        });
      }
    }
  }

  return toolCalls;
}

/**
 * Convert Pi session stats to our format
 */
function convertStats(piStats: PiSessionStats): SessionStats {
  return {
    tokens: {
      input: piStats.tokens.input,
      output: piStats.tokens.output,
      total: piStats.tokens.total,
    },
    cost: piStats.cost,
  };
}

function resolveBundledGithubModelsExtension(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Running from source (tsx src/cli.ts)
    path.resolve(here, "extensions/github-models/index.ts"),
    // Running from package build (node dist/cli.js), extension shipped as TS source
    path.resolve(here, "../src/extensions/github-models/index.ts"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Bundled github-models extension not found. Ensure src/extensions/github-models/index.ts is packaged.",
  );
}

/**
 * Create a temporary workspace with optional setup
 */
export async function createWorkspace(setup?: TestSetup): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-eval-"));

  if (setup?.files) {
    for (const [filePath, content] of Object.entries(setup.files)) {
      const fullPath = path.join(tmpDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
    }
  }

  if (setup?.commands) {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    for (const cmd of setup.commands) {
      await execAsync(cmd, { cwd: tmpDir });
    }
  }

  return tmpDir;
}

/**
 * Clean up a workspace directory
 */
export async function cleanupWorkspace(cwd: string): Promise<void> {
  try {
    await fs.rm(cwd, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
