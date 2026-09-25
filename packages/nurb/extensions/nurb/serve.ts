// node:child_process is used here and only here: pi.exec awaits exit, which a
// server never does, so `nurb dev` needs a raw detached spawn.
import { type ChildProcess, spawn } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const NURB_URL_RE = /http:\/\/127\.0\.0\.1:\d+/;

const ADOPT_CHANNEL = "processes:command:adopt";
const ADOPT_TIMEOUT_MS = 2000;
const URL_TIMEOUT_MS = 30_000;

const ADOPT_MISSING_MESSAGE =
  "Could not hand the `nurb dev` process to pi-processes. " +
  "The @aliou/pi-processes extension must be installed and enabled.";

export function urlFromOutput(text: string): string | null {
  const match = NURB_URL_RE.exec(text);
  if (!match) return null;
  return match[0];
}

// Mirrors nurb's cli.py _pick_port: when another nurb dev already serves this
// project, nurb prints an "already serving ... at <url>" error to stderr and
// exits. That URL is a successful result; there is nothing to adopt.
export function alreadyServingUrl(stderr: string): string | null {
  if (!stderr.includes("already serving this project at")) return null;
  return urlFromOutput(stderr);
}

interface AdoptOk {
  ok: true;
}
interface AdoptFail {
  ok: false;
  error: string;
}
type AdoptReply = AdoptOk | AdoptFail;
type AdoptOutcome = AdoptOk | AdoptFail | { ok: "no-listener" };

interface AdoptPayload {
  name: string;
  command: string;
  cwd: string;
  child: ChildProcess;
  initialStdout: Buffer;
  initialStderr: Buffer;
  startTime: number;
}

// Hand the child to pi-processes via the adopt channel. "no-listener" means
// no reply arrived in time: pi-processes is not loaded.
function adopt(pi: ExtensionAPI, payload: AdoptPayload): Promise<AdoptOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: "no-listener" });
    }, ADOPT_TIMEOUT_MS);
    timer.unref();
    pi.events.emit(ADOPT_CHANNEL, {
      ...payload,
      reply: (result: AdoptReply) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (result.ok) {
          resolve({ ok: true });
          return;
        }
        resolve({ ok: false, error: result.error });
      },
    });
  });
}

type WatchOutcome =
  | { kind: "url"; url: string; stdout: string; stderr: string }
  | { kind: "exited"; stdout: string; stderr: string; code: number | null }
  | { kind: "error"; error: Error }
  | { kind: "timeout"; stdout: string; stderr: string };

function watchForUrl(child: ChildProcess): Promise<WatchOutcome> {
  let stdout = "";
  let stderr = "";
  return new Promise((resolve) => {
    let done = false;
    let timer: NodeJS.Timeout | undefined;

    // Every listener is named so the buffers stop growing once ownership has
    // been decided; a detached server can live for hours after this point.
    const finish = (outcome: WatchOutcome) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      child.stdout?.off("data", onStdout);
      child.stderr?.off("data", onStderr);
      child.off("close", onClose);
      child.off("error", onError);
      resolve(outcome);
    };
    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString();
      const url = urlFromOutput(stdout);
      if (url) finish({ kind: "url", url, stdout, stderr });
    };
    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString();
    };
    // "close" fires after the stdio streams flush, so the buffers are complete.
    const onClose = (code: number | null) => {
      finish({ kind: "exited", stdout, stderr, code });
    };
    const onError = (error: Error) => {
      finish({ kind: "error", error });
    };

    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);
    child.once("close", onClose);
    child.once("error", onError);
    timer = setTimeout(() => {
      finish({ kind: "timeout", stdout, stderr });
    }, URL_TIMEOUT_MS);
  });
}

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    void 0; // process group already gone; nothing to kill
  }
}

function killTree(child: ChildProcess): void {
  killGroup(child, "SIGTERM");
  setTimeout(() => killGroup(child, "SIGKILL"), 1000).unref();
}

// Spawn `nurb dev`, wait for its URL, hand the process to pi-processes.
// Returns the text the tool should report on success.
export async function serveNurb(
  pi: ExtensionAPI,
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  if (process.platform === "win32") {
    throw new Error("nurb dev is not supported on Windows.");
  }
  if (signal?.aborted) throw new Error("Aborted");

  const startTime = Date.now();
  const child = spawn("nurb", ["dev"], {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // After adoption the process belongs to pi-processes, so the abort listener
  // must be dropped: a later abort must not kill a process we no longer own.
  const onAbort = () => killTree(child);
  signal?.addEventListener("abort", onAbort, { once: true });

  const outcome = await watchForUrl(child);

  if (outcome.kind === "exited") {
    signal?.removeEventListener("abort", onAbort);
    const url = alreadyServingUrl(outcome.stderr);
    if (url) {
      return `nurb dev is already serving this project at ${url} (use that URL; a save reaches it without a restart).`;
    }
    const stderr = outcome.stderr.trim();
    if (stderr) throw new Error(stderr);
    throw new Error(`nurb dev exited with code ${outcome.code}`);
  }
  if (outcome.kind === "error") {
    signal?.removeEventListener("abort", onAbort);
    throw new Error(`Failed to start nurb dev: ${outcome.error.message}`);
  }
  if (outcome.kind === "timeout") {
    signal?.removeEventListener("abort", onAbort);
    killTree(child);
    const stderr = outcome.stderr.trim();
    const detail = stderr ? `\n${stderr}` : "";
    throw new Error(`nurb dev did not report a URL within 30s.${detail}`);
  }

  const result = await adopt(pi, {
    name: `nurb dev - ${basename(cwd)}`,
    command: "nurb dev",
    cwd,
    child,
    initialStdout: Buffer.from(outcome.stdout),
    initialStderr: Buffer.from(outcome.stderr),
    startTime,
  });
  signal?.removeEventListener("abort", onAbort);
  if (result.ok === true) {
    return (
      `nurb dev is serving at ${outcome.url}` +
      " (process managed by @aliou/pi-processes). Share this URL with the user."
    );
  }
  killTree(child);
  if (result.ok === false) {
    throw new Error(`${ADOPT_MISSING_MESSAGE} (adopt failed: ${result.error})`);
  }
  throw new Error(ADOPT_MISSING_MESSAGE);
}
