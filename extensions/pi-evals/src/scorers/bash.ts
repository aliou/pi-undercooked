/**
 * Bash scorer - runs a command and checks exit code
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Expected, Scorer } from "../types";

const execAsync = promisify(exec);

export interface BashOptions {
  /** Expected exit code (default: 0) */
  exitCode?: number;
  /** Timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Creates a scorer that runs a bash command and checks the exit code.
 * Useful for running tests, linters, or other validation commands.
 */
export function bash(
  command: string,
  options: BashOptions = {},
): Scorer<Expected> {
  const { exitCode: expectedCode = 0, timeout = 30000 } = options;

  return {
    name: "bash",
    score: async (ctx) => {
      try {
        const _result = await execAsync(command, {
          cwd: ctx.cwd,
          timeout,
          env: { ...process.env, PATH: process.env.PATH },
        });

        // Command succeeded (exit code 0)
        if (expectedCode === 0) {
          return {
            name: "bash",
            score: 1,
            reason: `Command succeeded: ${command}`,
          };
        } else {
          return {
            name: "bash",
            score: 0,
            reason: `Expected exit code ${expectedCode}, got 0`,
          };
        }
      } catch (err) {
        const error = err as Error & {
          code?: number;
          killed?: boolean;
          stdout?: string;
          stderr?: string;
        };

        if (error.killed) {
          return {
            name: "bash",
            score: 0,
            reason: `Command timed out after ${timeout}ms: ${command}`,
          };
        }

        const actualCode = error.code ?? 1;

        if (actualCode === expectedCode) {
          return {
            name: "bash",
            score: 1,
            reason: `Command exited with expected code ${expectedCode}: ${command}`,
          };
        }

        const stderr = error.stderr ? `\n${truncate(error.stderr, 200)}` : "";

        return {
          name: "bash",
          score: 0,
          reason: `Command failed with code ${actualCode}: ${command}${stderr}`,
        };
      }
    },
  };
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 3)}...`;
}
