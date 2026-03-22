import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CRIT_REVIEW_FINISHED_TYPE } from "../hooks/review-finished-message";

interface ReviewCycleResponse {
  status?: string;
  review_file?: string;
  prompt?: string;
}

interface ListenerRecord {
  piSessionId: string;
  abortController: AbortController;
}

interface StartReviewListenerParams {
  pi: ExtensionAPI;
  piSessionId: string;
  cwd: string;
  critSessionId: string;
  port?: number;
  url?: string;
}

interface ReviewFinishedDetails {
  status: "finished" | "error";
  sessionId: string;
  port?: number;
  url?: string;
  reviewFile?: string;
  prompt?: string;
  error?: string;
}

const listeners = new Map<string, ListenerRecord>();

function makeListenerKey(
  piSessionId: string,
  cwd: string,
  critSessionId: string,
): string {
  return `${piSessionId}\0${cwd}\0${critSessionId}`;
}

function critSessionFilePath(critSessionId: string): string {
  return join(homedir(), ".crit", "sessions", `${critSessionId}.json`);
}

async function resolvePortFromSessionFile(
  critSessionId: string,
): Promise<number | undefined> {
  try {
    const text = await readFile(critSessionFilePath(critSessionId), "utf-8");
    const parsed = JSON.parse(text) as { port?: number };
    if (typeof parsed.port === "number" && parsed.port > 0) {
      return parsed.port;
    }
  } catch {
    // Session file may not exist yet.
  }
  return undefined;
}

async function waitForPort(
  critSessionId: string,
  signal: AbortSignal,
  timeoutMs = 10000,
): Promise<number | undefined> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (signal.aborted) return undefined;

    const port = await resolvePortFromSessionFile(critSessionId);
    if (port) return port;

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return undefined;
}

function sendReviewMessage(
  pi: ExtensionAPI,
  content: string,
  details: ReviewFinishedDetails,
  triggerTurn: boolean,
): void {
  pi.sendMessage(
    {
      customType: CRIT_REVIEW_FINISHED_TYPE,
      content,
      display: true,
      details,
    },
    {
      deliverAs: "followUp",
      triggerTurn,
    },
  );
}

async function runListener(
  pi: ExtensionAPI,
  record: ListenerRecord,
  params: StartReviewListenerParams,
): Promise<void> {
  const port =
    params.port ??
    (await waitForPort(params.critSessionId, record.abortController.signal));

  if (!port) {
    if (!record.abortController.signal.aborted) {
      sendReviewMessage(
        pi,
        "Crit listener failed: could not resolve daemon port.",
        {
          status: "error",
          sessionId: params.critSessionId,
          error: "Could not resolve daemon port for review cycle.",
        },
        false,
      );
    }
    return;
  }

  const baseUrl = params.url ?? `http://localhost:${port}`;

  try {
    const response = await fetch(`${baseUrl}/api/review-cycle`, {
      method: "POST",
      signal: record.abortController.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      sendReviewMessage(
        pi,
        `Crit listener failed: ${response.status} ${response.statusText}`,
        {
          status: "error",
          sessionId: params.critSessionId,
          port,
          url: baseUrl,
          error:
            responseText.trim() ||
            `review-cycle request failed with ${response.status}`,
        },
        false,
      );
      return;
    }

    const payload = (await response.json()) as ReviewCycleResponse;
    if (record.abortController.signal.aborted) return;

    const prompt = payload.prompt?.trim();
    const content = prompt
      ? prompt
      : "Crit review finished. Read .crit.json and address unresolved comments.";

    sendReviewMessage(
      pi,
      content,
      {
        status: "finished",
        sessionId: params.critSessionId,
        port,
        url: baseUrl,
        reviewFile: payload.review_file,
        prompt,
      },
      true,
    );
  } catch (error) {
    if (record.abortController.signal.aborted) return;

    const message = error instanceof Error ? error.message : String(error);
    sendReviewMessage(
      pi,
      `Crit listener failed: ${message}`,
      {
        status: "error",
        sessionId: params.critSessionId,
        port,
        url: baseUrl,
        error: message,
      },
      false,
    );
  }
}

export function startReviewListener(params: StartReviewListenerParams): void {
  const key = makeListenerKey(params.piSessionId, params.cwd, params.critSessionId);

  const previous = listeners.get(key);
  if (previous) {
    previous.abortController.abort();
    listeners.delete(key);
  }

  const record: ListenerRecord = {
    piSessionId: params.piSessionId,
    abortController: new AbortController(),
  };
  listeners.set(key, record);

  void runListener(params.pi, record, params).finally(() => {
    const current = listeners.get(key);
    if (current === record) {
      listeners.delete(key);
    }
  });
}

export function abortReviewListenersForPiSession(piSessionId: string): void {
  for (const [key, record] of listeners.entries()) {
    if (record.piSessionId !== piSessionId) continue;
    record.abortController.abort();
    listeners.delete(key);
  }
}
