import { Type } from "typebox";

const OptionSchema = Type.Object({
  label: Type.String({ description: "Option name (1-5 words)" }),
  description: Type.String({
    description: "Explanation of this choice with implications/trade-offs",
  }),
  preview: Type.Optional(
    Type.String({
      description:
        "Preview content rendered when this option is focused. Use for code snippets, mockups, config examples. Only for single-select questions.",
    }),
  ),
});

const QuestionSchema = Type.Object({
  question: Type.String({
    description: "Complete question text ending with ?",
  }),
  header: Type.String({
    description: "Short label (max 12 chars) shown as chip/tag",
    maxLength: 12,
  }),
  multiSelect: Type.Boolean({
    description:
      "false for mutually exclusive choices, true when multiple selections make sense",
  }),
  options: Type.Array(OptionSchema, {
    minItems: 2,
    maxItems: 4,
    description: "2-4 distinct choices",
  }),
});

const AnnotationSchema = Type.Object({
  preview: Type.Optional(
    Type.String({ description: "Preview content of the selected option" }),
  ),
  notes: Type.Optional(
    Type.String({ description: "Free-text notes the user added" }),
  ),
});

export const AskUserQuestionParams = Type.Object({
  questions: Type.Array(QuestionSchema, {
    minItems: 1,
    maxItems: 4,
    description: "1-4 questions to present",
  }),
  metadata: Type.Optional(
    Type.Object({
      source: Type.Optional(
        Type.String({ description: "Identifier for analytics" }),
      ),
    }),
  ),
});

export { AnnotationSchema, OptionSchema, QuestionSchema };
