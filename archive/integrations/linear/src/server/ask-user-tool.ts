import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Callback that emits an elicitation to Linear and waits for the user's reply.
 */
export type ElicitationHandler = (body: string) => Promise<string | undefined>;

const AskUserParams = Type.Object({
  question: Type.String({ description: "The question to ask the user" }),
  options: Type.Optional(
    Type.Array(Type.String(), {
      description: "If provided, the user picks from these options",
    }),
  ),
});

/**
 * Simple ask_user tool that bridges to Linear elicitation activities.
 */
export function createAskUserTool(
  onElicitation: ElicitationHandler,
): ToolDefinition {
  return {
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user a question and wait for their response. Use when you need clarification or a decision.",
    // Cast needed due to TypeBox version mismatch between our dep and pi-coding-agent's
    parameters: AskUserParams as unknown as ToolDefinition["parameters"],
    execute: async (_toolCallId: string, params: Record<string, unknown>) => {
      const question = params.question as string;
      const options = params.options as string[] | undefined;

      let body = question;
      if (options?.length) {
        body +=
          "\n\n" +
          options.map((o: string, i: number) => `${i + 1}. ${o}`).join("\n");
      }

      const response = await onElicitation(body);

      return {
        content: [
          {
            type: "text" as const,
            text: response ?? "The user did not respond.",
          },
        ],
        details: {},
      };
    },
  };
}
