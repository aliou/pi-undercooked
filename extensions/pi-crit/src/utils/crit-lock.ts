import { open, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const LOCK_FILE = ".crit.json.lock";
const STALE_LOCK_MS = 60_000;
const ACQUIRE_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function getCritLockPath(cwd: string, outputDir: string): string {
  const baseDir = outputDir
    ? isAbsolute(outputDir)
      ? outputDir
      : resolve(cwd, outputDir)
    : cwd;
  return join(baseDir, LOCK_FILE);
}

export async function withCritJsonLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const startedAt = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw new Error("Aborted while waiting for .crit.json lock");
    }

    try {
      const handle = await open(lockPath, "wx");
      try {
        await writeFile(
          lockPath,
          JSON.stringify({
            pid: process.pid,
            createdAt: new Date().toISOString(),
          }),
          "utf-8",
        );

        try {
          return await fn();
        } finally {
          await rm(lockPath, { force: true });
        }
      } finally {
        await handle.close();
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (isAbortError(error)) {
        throw error;
      }

      if (code !== "EEXIST") {
        throw error;
      }

      try {
        const lockStat = await stat(lockPath);
        const age = Date.now() - lockStat.mtimeMs;
        if (age > STALE_LOCK_MS) {
          await rm(lockPath, { force: true });
          continue;
        }
      } catch {
        // Lock disappeared between checks. Retry.
        continue;
      }

      if (Date.now() - startedAt > ACQUIRE_TIMEOUT_MS) {
        throw new Error(
          "Timed out waiting for .crit.json lock. Another crit command may still be writing review state.",
        );
      }

      await sleep(100);
    }
  }
}
