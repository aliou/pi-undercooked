import { readFileSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { fileURLToPath } from "node:url";

const LUA_DIR = fileURLToPath(new URL("../../lua/", import.meta.url));
const AD_LUA = readFileSync(`${LUA_DIR}ad.lua`, "utf8");

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Operation aborted");
  }
}

function withAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  onAbort?: () => void,
): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort?.();
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("Operation aborted"),
      );
    };

    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export const DAP_PORT = 55934;

export interface DapResponse {
  seq: number;
  type: string;
  command: string;
  success: boolean;
  message?: string;
  body?: Record<string, unknown>;
}

export interface DapEvalResult {
  success: boolean;
  result?: string;
}

type PendingEntry = {
  resolve: (value: DapResponse) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup?: () => void;
};

export class DapClient {
  constructor(private readonly onOutput?: (line: string) => void) {}

  private socket: Socket | null = null;
  private seq: number = 0;
  private pending: Map<number, PendingEntry> = new Map();
  private buffer: Buffer = Buffer.alloc(0);
  private connected: boolean = false;
  private injected: boolean = false;
  private connectPromise: Promise<void> | null = null;

  async connect(port: number = DAP_PORT, signal?: AbortSignal): Promise<void> {
    if (this.connected) return;
    if (this.connectPromise) {
      await withAbort(this.connectPromise, signal);
      return;
    }

    const connectPromise = this.doConnect(port, signal);
    this.connectPromise = connectPromise;

    try {
      await withAbort(connectPromise, signal, () => this.disconnect());
    } finally {
      if (this.connectPromise === connectPromise) {
        this.connectPromise = null;
      }
    }
  }

  disconnect(): void {
    this.socket?.destroy();
    this.clearState();
  }

  private async doConnect(port: number, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    await withAbort(
      new Promise<void>((resolve, reject) => {
        const sock = createConnection({ port }, () => {
          this.connected = true;
          resolve();
        });

        sock.on("data", (chunk: Buffer) => this.onData(chunk));

        sock.on("close", () => {
          this.clearState();
        });

        sock.on("error", (err) => {
          if (!this.connected) {
            reject(err);
          }
          this.clearState();
        });

        this.socket = sock;
      }),
      signal,
      () => this.socket?.destroy(),
    );

    await this.send(
      "initialize",
      {
        clientID: "pi-playdate",
        clientName: "pi-playdate",
        adapterID: "playdate",
        linesStartAt1: true,
        columnsStartAt1: true,
        pathFormat: "path",
      },
      signal,
    );

    await this.send("configurationDone", undefined, signal);

    await this.injectHelpers(signal);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private clearState(): void {
    this.connected = false;
    this.injected = false;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.cleanup?.();
      entry.reject(new Error("DAP connection closed"));
    }
    this.pending.clear();
  }

  private send(
    command: string,
    args?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<DapResponse> {
    return new Promise<DapResponse>((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("DAP client not connected"));
        return;
      }

      const seq = ++this.seq;
      const message: Record<string, unknown> = {
        seq,
        type: "request",
        command,
      };
      if (args !== undefined) {
        message.arguments = args;
      }

      const body = JSON.stringify(message);
      const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`DAP request timed out: ${command}`));
      }, 10000);

      const abort = () => {
        this.pending.delete(seq);
        clearTimeout(timer);
        reject(
          signal?.reason instanceof Error
            ? signal.reason
            : new Error("Operation aborted"),
        );
      };

      const cleanup = signal
        ? () => signal.removeEventListener("abort", abort)
        : undefined;

      this.pending.set(seq, { resolve, reject, timer, cleanup });
      signal?.addEventListener("abort", abort, { once: true });

      this.socket.write(frame, (err) => {
        if (err) {
          cleanup?.();
          this.pending.delete(seq);
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const headerStr = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(headerStr);
      if (!match) {
        // Malformed, skip ahead
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (this.buffer.length < bodyEnd) break;

      const bodyStr = this.buffer.slice(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.slice(bodyEnd);

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(bodyStr) as Record<string, unknown>;
      } catch (parseError) {
        // Skip malformed JSON messages
        void parseError;
        continue;
      }

      if (msg.type === "response") {
        const requestSeq = msg.request_seq as number;
        const entry = this.pending.get(requestSeq);
        if (entry) {
          clearTimeout(entry.timer);
          entry.cleanup?.();
          this.pending.delete(requestSeq);
          entry.resolve(msg as unknown as DapResponse);
        }
      }

      if (msg.type === "event" && msg.event === "output") {
        const body = msg.body as Record<string, unknown> | undefined;
        const output = typeof body?.output === "string" ? body.output : "";
        const category =
          typeof body?.category === "string" ? body.category : undefined;
        const prefix =
          category && category !== "console" ? `[${category}] ` : "";
        for (const line of output.split(/\r?\n/)) {
          if (!line.trim()) continue;
          this.onOutput?.(`${prefix}${line}`);
        }
      }
    }
  }

  async evaluate(
    expression: string,
    signal?: AbortSignal,
  ): Promise<DapEvalResult> {
    const response = await this.send(
      "evaluate",
      {
        expression,
        context: "repl",
      },
      signal,
    );

    if (!response.success) {
      return { success: false, result: response.message };
    }

    const result = response.body?.result as string | undefined;
    return { success: true, result };
  }

  async evalLua(code: string, signal?: AbortSignal): Promise<string> {
    const result = await this.evaluate(`eval ${code}`, signal);
    if (!result.success) {
      throw new Error(result.result ?? "evalLua failed");
    }
    return result.result ?? "";
  }

  async screenshot(outputPath: string, signal?: AbortSignal): Promise<void> {
    await this.evalLua(
      `playdate.simulator.writeToFile(playdate.graphics.getDisplayImage(), "${outputPath}")`,
      signal,
    );
  }

  private async injectHelpers(signal?: AbortSignal): Promise<void> {
    if (this.injected) return;

    await this.evalLua(`ad = (function()\n${AD_LUA}\nend)()`, signal);

    this.injected = true;
  }
}
