import type { ExtensionAPI, ExtensionContext, AgentToolResult, Theme, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type, type Static } from "@sinclair/typebox";

// OSC 9;4 progress bar sequences for iTerm2, Ghostty, and compatible terminals.
//
// op=0: clear, op=1: determinate (0-100), op=2: error, op=3: indeterminate
//
// Terminals that don't understand OSC 9 silently ignore it.

function osc9(op: number, value?: number): string {
	const payload = `\x1b]9;4;${op};${value ?? ""}\x07`;

	if (process.env.TMUX) {
		const doubled = payload.replace(/\x1b/g, "\x1b\x1b");
		return `\x1bPtmux;${doubled}\x1b\\`;
	}

	if (process.env.STY) {
		return `\x1bP${payload}\x1b\\`;
	}

	return payload;
}

function send(op: number, value?: number): void {
	process.stdout.write(osc9(op, value));
}

function clear(): void {
	send(0);
}

function indeterminate(): void {
	send(3);
}

function error(): void {
	send(2);
}

function progress(percent: number): void {
	send(1, Math.max(0, Math.min(100, Math.round(percent))));
}

// --- Tool types ---

interface SleepDetails {
	seconds?: number;
	progress?: number;
}

const parameters = Type.Object({
	seconds: Type.Number({ description: "Duration to sleep in seconds", minimum: 1, maximum: 300 }),
});

type SleepParams = Static<typeof parameters>;

// --- Extension ---

export default function register(pi: ExtensionAPI, _ctx: ExtensionContext): void {
	let hadError = false;

	pi.on("agent_start", async () => {
		hadError = false;
		indeterminate();
	});

	pi.on("tool_execution_end", async (event) => {
		if (event.isError) {
			hadError = true;
			error();
		}
	});

	pi.on("agent_end", async () => {
		if (hadError) {
			error();
			setTimeout(() => clear(), 1500);
		} else {
			clear();
		}
	});

	pi.on("session_shutdown", async () => {
		clear();
	});

	pi.registerTool({
		name: "sleep_progress",
		label: "Sleep",
		description:
			"Sleep for a given duration in seconds, showing a determinate progress bar in the terminal tab. Use this to test/demo the OSC 9 progress indicator.",
		parameters,

		async execute(
			_toolCallId: string,
			params: SleepParams,
			signal: AbortSignal | undefined,
			onUpdate: ((update: AgentToolResult<SleepDetails>) => void) | undefined,
			_ctx: ExtensionContext,
		): Promise<AgentToolResult<SleepDetails>> {
			const { seconds } = params;
			const startMs = Date.now();
			const totalMs = seconds * 1000;
			const intervalMs = 250;

			return new Promise<AgentToolResult<SleepDetails>>((resolve, reject) => {
				progress(0);

				const timer = setInterval(() => {
					if (signal?.aborted) {
						clearInterval(timer);
						error();
						setTimeout(() => clear(), 2000);
						reject(new Error(`Sleep aborted after ${Math.round((Date.now() - startMs) / 1000)}s of ${seconds}s.`));
						return;
					}

					const elapsed = Date.now() - startMs;
					const pct = Math.min(100, (elapsed / totalMs) * 100);
					progress(pct);

					onUpdate?.({
						content: [{ type: "text", text: `${Math.round(pct)}%` }],
						details: { seconds, progress: Math.round(pct) },
					});

					if (elapsed >= totalMs) {
						clearInterval(timer);
						indeterminate();
						resolve({
							content: [{ type: "text", text: `Slept for ${seconds}s.` }],
							details: { seconds, progress: 100 },
						});
					}
				}, intervalMs);
			});
		},

		renderCall(params: SleepParams, theme: Theme) {
			return new Text(theme.fg("toolTitle", `Sleep: ${params.seconds}s`), 0, 0);
		},

		renderResult(
			result: AgentToolResult<SleepDetails>,
			options: ToolRenderResultOptions,
			theme: Theme,
		) {
			if (options.isPartial) {
				const pct = result.details?.progress ?? 0;
				return new Text(theme.fg("muted", `Sleeping... ${pct}%`), 0, 0);
			}

			const details = result.details;

			if (details?.seconds === undefined) {
				const textBlock = result.content.find((c) => c.type === "text");
				const msg = (textBlock?.type === "text" && textBlock.text) || "Sleep failed";
				return new Text(theme.fg("error", msg), 0, 0);
			}

			return new Text(theme.fg("success", `Slept for ${details.seconds}s.`), 0, 0);
		},
	});
}
