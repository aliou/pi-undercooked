import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import type { AskUserQuestionParams } from "./schema";
import type { AskUserQuestionDetails, Question } from "./types";

type Params = Static<typeof AskUserQuestionParams>;

export function renderCall(args: Params, theme: Theme) {
  const count = args.questions?.length ?? 0;
  const plural = count === 1 ? "question" : "questions";
  const headers = args.questions?.map((q: Question) => q.header).join(", ");
  return new Text(
    theme.fg("accent", `Ask User: ${count} ${plural}`) +
      (headers ? ` [${headers}]` : ""),
    0,
    0,
  );
}

export function renderResult(
  result: AgentToolResult<AskUserQuestionDetails>,
  { expanded }: ToolRenderResultOptions,
  theme: Theme,
): Text {
  const { details } = result;

  if (details?.error) {
    if (details.error === "cancelled") {
      return new Text(theme.fg("warning", "Cancelled"), 0, 0);
    }
    return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
  }

  if (details?.chatAboutThis) {
    return new Text(
      theme.fg("warning", "● User wants to discuss these questions"),
      0,
      0,
    );
  }

  const answers = details?.answers as Record<string, string> | undefined;
  if (!answers || Object.keys(answers).length === 0) {
    const text = result.content[0];
    return new Text(
      text?.type === "text" && text.text ? text.text : "No answers",
      0,
      0,
    );
  }

  const questions = details?.questions as Question[] | undefined;
  const annotations = details?.annotations;

  if (expanded && questions) {
    let text = `${theme.fg("success", "●")} User answered questions:\n`;

    questions.forEach((q, idx) => {
      const prefix = idx === 0 ? "└ " : "  ";
      const answer = answers[q.question] ?? "(none)";

      text += `\n${prefix}${theme.fg("accent", `[${q.header}]`)} ${theme.fg("toolOutput", q.question)}`;

      q.options.forEach((opt) => {
        const isSelected =
          answer.split(", ").includes(opt.label) ||
          answer.startsWith(`Other: `);
        const bullet = isSelected
          ? theme.fg("success", "  ✓ ")
          : theme.fg("dim", "  ○ ");
        const label = isSelected
          ? theme.fg("accent", opt.label)
          : theme.fg("muted", opt.label);
        text += `\n${bullet}${label} ${theme.fg("dim", `— ${opt.description}`)}`;
      });

      if (answer.startsWith("Other:")) {
        text += `\n${theme.fg("success", "  ✓ ")}${theme.fg("accent", answer)}`;
      }

      const annotation = annotations?.[q.question];
      if (annotation?.notes) {
        text += `\n  ${theme.fg("warning", "Notes: ")}${theme.fg("muted", annotation.notes)}`;
      }
      if (annotation?.preview) {
        text += `\n  ${theme.fg("dim", "Preview: ")}${theme.fg("muted", annotation.preview.slice(0, 80))}${annotation.preview.length > 80 ? "…" : ""}`;
      }
    });

    return new Text(text, 0, 0);
  }

  let text = `${theme.fg("success", "●")} User answered questions:`;

  if (questions) {
    questions.forEach((q, idx) => {
      const prefix = idx === 0 ? "\n└  · " : "\n   · ";
      const answer = answers[q.question] ?? "(none)";
      const questionStr = theme.fg("muted", q.question);
      const arrow = " → ";
      const answerStr = theme.fg("accent", answer);
      text += prefix + questionStr + arrow + answerStr;
    });
  } else {
    // Fallback: iterate answers record directly
    Object.entries(answers).forEach(([q, a], idx) => {
      const prefix = idx === 0 ? "\n└  · " : "\n   · ";
      text += `${prefix + theme.fg("muted", q)} → ${theme.fg("accent", a)}`;
    });
  }

  return new Text(text, 0, 0);
}
