import { describe, expect, it } from "vitest";
import { parseFlowDeckOutput } from "./parser";

const cmd = ["build"];

/** FlowDeck 1.25 wraps every NDJSON event in a payload envelope. */
const wrap = (payload: Record<string, unknown>) =>
  JSON.stringify({ $schema: "x", payload, schemaVersion: "1.0.0" });

const nd = (...payloads: Record<string, unknown>[]) =>
  payloads.map(wrap).join("\n");

describe("parseFlowDeckOutput", () => {
  it("reads the terminal result out of the payload envelope", () => {
    const out = nd(
      { type: "status", message: "Building app..." },
      { type: "result", success: true, message: "BUILD succeeded" },
    );
    const result = parseFlowDeckOutput(out, "", cmd);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("success");
  });

  it("still handles un-enveloped events from older FlowDeck versions", () => {
    const out = JSON.stringify({ type: "result", success: true });
    expect(parseFlowDeckOutput(out, "", cmd).ok).toBe(true);
  });

  it("prefers a failure on stderr over an apparent success on stdout", () => {
    const stdout = nd({ type: "result", success: true, message: "ok" });
    const stderr = nd({
      type: "result",
      success: false,
      userMessage: "Build failed (exit code: 65)",
    });
    const result = parseFlowDeckOutput(stdout, stderr, cmd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("exit code: 65");
  });

  it("does not report success when only progress events were emitted", () => {
    const out = nd(
      { type: "status", message: "Building app..." },
      { type: "status", message: "Compiling..." },
    );
    const result = parseFlowDeckOutput(out, "", cmd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe(
      "FlowDeck did not report a final result",
    );
  });

  it("does not report success when only diagnostics were emitted", () => {
    const out = nd(
      { type: "status", message: "Building app..." },
      { type: "build_errors", message: "Build failed with 1 error" },
    );
    const result = parseFlowDeckOutput(out, "", cmd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("Build failed with 1 error");
  });

  it("prepends diagnostics to the terminal failure message", () => {
    const out = nd(
      { type: "build_errors", message: "Build failed with 1 error" },
      { type: "result", success: false, userMessage: "Build failed (65)" },
    );
    const result = parseFlowDeckOutput(out, "", cmd);
    expect(result.error?.message).toBe(
      "Build failed with 1 error\nBuild failed (65)",
    );
  });

  it("parses a standalone JSON object response", () => {
    const out = JSON.stringify({ appearance: "light", success: true });
    const result = parseFlowDeckOutput(out, "", ["simulator", "appearance"]);
    expect(result.ok).toBe(true);
    expect((result.data as Record<string, unknown>).appearance).toBe("light");
  });

  it("surfaces a plain-text stderr message when stdout is empty", () => {
    const stderr =
      "Cannot run accessibility commands against iPhone 17 Pro as it is not booted";
    const result = parseFlowDeckOutput("", stderr, [
      "ui",
      "simulator",
      "screen",
    ]);
    expect(result.ok).toBe(false);
    expect(result.rawStderr).toContain("not booted");
  });

  it("reports missing output rather than inventing a result", () => {
    const result = parseFlowDeckOutput("", "", cmd);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("no output");
  });

  it("strips ANSI escapes from failure messages", () => {
    const out = nd({
      type: "result",
      success: false,
      userMessage: "\u001b[31m\u001b[1mXcode Build Errors (1):\u001b[0m boom",
    });
    const result = parseFlowDeckOutput(out, "", cmd);
    expect(result.error?.message).toBe("Xcode Build Errors (1): boom");
  });

  it("attaches both raw streams to failures", () => {
    const stdout = nd({ type: "status", message: "Building..." });
    const result = parseFlowDeckOutput(stdout, "boom", cmd);
    expect(result.rawStdout).toContain("Building...");
    expect(result.rawStderr).toBe("boom");
  });

  it("ignores interleaved non-JSON log lines", () => {
    const out = [
      "warning: something noisy",
      wrap({ type: "result", success: true, message: "ok" }),
    ].join("\n");
    expect(parseFlowDeckOutput(out, "", cmd).ok).toBe(true);
  });
});

describe("fallback messages", () => {
  it("uses an app_log message when no result event arrives", () => {
    const out = wrap({
      type: "app_log",
      message: "Failed to boot simulator: Invalid device or device pair: nope",
    });
    const result = parseFlowDeckOutput(out, "", ["simulator", "boot"]);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("Invalid device or device pair");
  });

  it("uses plain stderr text when neither stream holds JSON", () => {
    const result = parseFlowDeckOutput("", "Simulator is not booted", [
      "ui",
      "simulator",
      "screen",
    ]);
    expect(result.error?.message).toBe("Simulator is not booted");
  });

  it("does not present a status line as the error message", () => {
    const out = nd(
      { type: "status", message: "Compiling..." },
      { type: "status", message: "Linking..." },
    );
    const result = parseFlowDeckOutput(out, "", cmd);
    expect(result.error?.message).toBe(
      "FlowDeck did not report a final result",
    );
  });
});
