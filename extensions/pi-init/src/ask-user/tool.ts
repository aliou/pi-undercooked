import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { Static } from "@sinclair/typebox";
import { executeAskUserQuestion } from "./execute";
import { renderCall, renderResult } from "./render";
import { AskUserQuestionParams } from "./schema";
import type { AskUserQuestionDetails } from "./types";

export function createAskUserTool(
  _pi: ExtensionAPI,
): ToolDefinition<typeof AskUserQuestionParams, AskUserQuestionDetails> {
  return {
    name: "init_questionnaire",
    label: "Ask User",
    description: `Asks the user multiple choice questions to gather information, clarify ambiguity, understand preferences, make decisions or offer them choices.

Usage notes:
- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected
- If you recommend a specific option, make that the first option and add "(Recommended)" at the end of the label
- Use the optional preview field on options when presenting concrete artifacts that users need to visually compare (code snippets, config examples, mockups)
- Preview is only supported for single-select questions`,

    parameters: AskUserQuestionParams,

    async execute(
      _toolCallId: string,
      params: Static<typeof AskUserQuestionParams>,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ) {
      return executeAskUserQuestion(ctx, params);
    },

    renderCall,
    renderResult,
  };
}
