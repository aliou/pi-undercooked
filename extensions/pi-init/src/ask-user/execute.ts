import { spawnSync } from "node:child_process";
import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import {
  CombinedAutocompleteProvider,
  Key,
  matchesKey,
  SelectList,
  type SelectListTheme,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import type { AskUserQuestionParams } from "./schema";
import type {
  Annotation,
  AskUserQuestionDetails,
  Question,
  QuestionOption,
} from "./types";

type Params = Static<typeof AskUserQuestionParams>;

interface ExecuteResult {
  content: Array<{ type: "text"; text: string }>;
  details: AskUserQuestionDetails;
}

interface OptionItem {
  label: string;
  description: string;
  preview?: string;
  isOther: boolean;
  isChatAboutThis: boolean;
}

interface ComponentState {
  mode: "question" | "other-input" | "notes-input" | "confirm";
  currentIndex: number;
  highlightIndex: number;
  /** Internal per-question selections (string[][] for easy mutation) */
  answers: string[][];
  /** Notes keyed by question text */
  notes: Record<string, string>;
  /** Shared text-editing buffer for both other-input and notes-input */
  otherLines: string[];
  otherCursorLine: number;
  otherCursorCol: number;
  previewScroll: number;
}

export async function executeAskUserQuestion(
  ctx: ExtensionContext,
  params: Params,
): Promise<ExecuteResult> {
  if (!ctx.hasUI) {
    return {
      content: [
        {
          type: "text",
          text: "Error: UI not available (running in non-interactive mode)",
        },
      ],
      details: {
        questions: params.questions as Question[],
        answers: {},
        error: "UI not available",
      },
    };
  }

  const fdResult = spawnSync("which", ["fd"], { encoding: "utf-8" });
  const fdPath = fdResult.status === 0 ? fdResult.stdout.trim() : null;
  const autocompleteProvider = new CombinedAutocompleteProvider(
    [],
    process.cwd(),
    fdPath ?? null,
  );

  const state: ComponentState = {
    mode: "question",
    currentIndex: 0,
    highlightIndex: 0,
    answers: params.questions.map(() => []),
    notes: {},
    otherLines: [""],
    otherCursorLine: 0,
    otherCursorCol: 0,
    previewScroll: 0,
  };

  const result = await ctx.ui.custom<ExecuteResult | null>(
    (tui, theme, _kb, done) => {
      const selectListTheme: SelectListTheme = {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("muted", t),
        noMatch: (t) => theme.fg("muted", t),
      };
      let autocompleteList: SelectList | null = null;
      let autocompletePrefix = "";

      const getAutocompleteList = () => autocompleteList;
      const setAutocompleteList = (list: SelectList | null) => {
        autocompleteList = list;
      };
      const getAutocompletePrefix = () => autocompletePrefix;
      const setAutocompletePrefix = (prefix: string) => {
        autocompletePrefix = prefix;
      };

      return {
        render(width: number): string[] {
          if (state.mode === "confirm") {
            return renderConfirmScreen(
              width,
              params.questions as Question[],
              state,
              theme,
            );
          }

          if (state.mode === "other-input" || state.mode === "notes-input") {
            return renderTextInputScreen(
              width,
              params.questions as Question[],
              state,
              theme,
              getAutocompleteList(),
            );
          }

          return renderQuestionScreen(
            width,
            params.questions as Question[],
            state,
            theme,
          );
        },

        invalidate(): void {},

        handleInput(data: string): void {
          if (state.mode === "question") {
            handleQuestionInput(
              data,
              state,
              params.questions as Question[],
              tui,
              done,
            );
          } else if (
            state.mode === "other-input" ||
            state.mode === "notes-input"
          ) {
            handleTextInput(
              data,
              state,
              params.questions as Question[],
              tui,
              autocompleteProvider,
              selectListTheme,
              getAutocompleteList,
              setAutocompleteList,
              getAutocompletePrefix,
              setAutocompletePrefix,
            );
          } else if (state.mode === "confirm") {
            handleConfirmInput(data, state, params, tui, done);
          }
        },
      };
    },
  );

  if (!result) {
    return {
      content: [{ type: "text", text: "User cancelled" }],
      details: {
        questions: params.questions as Question[],
        answers: {},
        error: "cancelled",
      },
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Option helpers
// ---------------------------------------------------------------------------

function buildAllOptions(question: Question): OptionItem[] {
  const agentOther = question.options.find(
    (opt) => opt.label.toLowerCase() === "other",
  );
  const regularOptions = question.options
    .filter((opt) => opt.label.toLowerCase() !== "other")
    .map(
      (opt): OptionItem => ({
        label: opt.label,
        description: opt.description,
        preview: (opt as QuestionOption).preview,
        isOther: false,
        isChatAboutThis: false,
      }),
    );
  return [
    ...regularOptions,
    {
      label: agentOther?.label ?? "Other",
      description: agentOther?.description ?? "Provide custom text",
      isOther: true,
      isChatAboutThis: false,
    },
    {
      label: "Chat about this",
      description: "Discuss these questions with the assistant",
      isOther: false,
      isChatAboutThis: true,
    },
  ];
}

function hasPreviewOptions(question: Question): boolean {
  return (
    !question.multiSelect &&
    question.options.some((opt) => (opt as QuestionOption).preview != null)
  );
}

// ---------------------------------------------------------------------------
// Progress dots
// ---------------------------------------------------------------------------

function renderProgressDots(
  theme: Theme,
  currentIndex: number,
  totalQuestions: number,
): string {
  const dots: string[] = [];
  for (let i = 0; i < totalQuestions; i++) {
    if (i < currentIndex) {
      dots.push(theme.fg("success", "●"));
    } else if (i === currentIndex) {
      dots.push(theme.fg("accent", "●"));
    } else {
      dots.push(theme.fg("dim", "○"));
    }
  }
  return dots.join(" ");
}

// ---------------------------------------------------------------------------
// Border helpers
// ---------------------------------------------------------------------------

function borderLine(
  theme: Theme,
  width: number,
  left: string,
  right: string,
  fill: string,
): string {
  return (
    theme.fg("border", left) +
    theme.fg("border", fill.repeat(Math.max(1, width - 2))) +
    theme.fg("border", right)
  );
}

function contentLine(theme: Theme, width: number, inner: string): string {
  const innerWidth = width - 4;
  const pad = Math.max(0, innerWidth - visibleWidth(inner));
  return (
    theme.fg("border", "│") +
    " " +
    truncateToWidth(inner, innerWidth) +
    " ".repeat(pad) +
    " " +
    theme.fg("border", "│")
  );
}

function emptyLine(theme: Theme, width: number): string {
  return (
    theme.fg("border", "│") +
    " ".repeat(Math.max(0, width - 2)) +
    theme.fg("border", "│")
  );
}

// ---------------------------------------------------------------------------
// Shared question header rendering (top border + question text)
// ---------------------------------------------------------------------------

function renderQuestionHeader(
  width: number,
  question: Question,
  questions: Question[],
  currentIndex: number,
  theme: Theme,
  lines: string[],
): void {
  const progressDots = renderProgressDots(
    theme,
    currentIndex,
    questions.length,
  );
  const progressLine =
    theme.fg("border", "╭") +
    theme.fg("border", "─") +
    " " +
    progressDots +
    " " +
    theme.fg(
      "border",
      "─".repeat(Math.max(1, width - visibleWidth(progressDots) - 5)),
    ) +
    theme.fg("border", "╮");
  lines.push(truncateToWidth(progressLine, width));
  lines.push(emptyLine(theme, width));

  const headerStr = theme.fg("accent", `[${question.header}]`);
  const questionStr = theme.fg("text", question.question);
  const headerAndQuestion = `${headerStr} ${questionStr}`;
  const wrappedQuestion = wrapTextWithAnsi(headerAndQuestion, width - 4);
  for (const line of wrappedQuestion) {
    lines.push(contentLine(theme, width, line));
  }
  lines.push(emptyLine(theme, width));
}

// ---------------------------------------------------------------------------
// renderQuestionScreen
// ---------------------------------------------------------------------------

function renderQuestionScreen(
  width: number,
  questions: Question[],
  state: ComponentState,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const question = questions[state.currentIndex];
  if (!question) {
    throw new Error(`Invalid current index: ${state.currentIndex}`);
  }

  renderQuestionHeader(
    width,
    question,
    questions,
    state.currentIndex,
    theme,
    lines,
  );

  const allOptions = buildAllOptions(question);

  if (hasPreviewOptions(question)) {
    renderOptionsWithPreview(width, question, allOptions, state, theme, lines);
  } else {
    renderOptionsList(width, question, allOptions, state, theme, lines);
  }

  lines.push(emptyLine(theme, width));
  lines.push(borderLine(theme, width, "├", "┤", "─"));

  const noteText = state.notes[question.question]
    ? `n notes(*)  `
    : "n notes  ";
  const controlsText = question.multiSelect
    ? `Space select · Enter next · Tab navigate · ${noteText}· Esc cancel`
    : `Enter select · Tab navigate · ${noteText}· Esc cancel`;
  lines.push(contentLine(theme, width, theme.fg("dim", controlsText)));
  lines.push(borderLine(theme, width, "╰", "╯", "─"));

  return lines;
}

// ---------------------------------------------------------------------------
// renderOptionsList (no preview pane)
// ---------------------------------------------------------------------------

function renderOptionsList(
  width: number,
  question: Question,
  allOptions: OptionItem[],
  state: ComponentState,
  theme: Theme,
  lines: string[],
): void {
  for (let i = 0; i < allOptions.length; i++) {
    const opt = allOptions[i];
    if (!opt) {
      throw new Error(`Invalid option index: ${i}`);
    }
    const isHighlighted = i === state.highlightIndex;
    const currentAnswers = state.answers[state.currentIndex] ?? [];
    const isSelected = opt.isOther
      ? currentAnswers.some((s) => s.startsWith("Other:"))
      : currentAnswers.includes(opt.label);

    const prefix = isHighlighted ? theme.fg("accent", "▶ ") : "  ";
    const checkbox = question.multiSelect
      ? isSelected
        ? theme.fg("success", "[✓]")
        : "[ ]"
      : "";

    const isRecommended = opt.label.endsWith("(Recommended)");
    let label: string;
    if (isHighlighted) {
      label = theme.fg("accent", opt.label);
    } else if (isSelected) {
      label = theme.fg("success", opt.label);
    } else if (isRecommended) {
      label = theme.fg("accent", opt.label);
    } else if (opt.isChatAboutThis) {
      label = theme.fg("muted", opt.label);
    } else {
      label = theme.fg("text", opt.label);
    }

    const desc = theme.fg("muted", `— ${opt.description}`);
    const checkboxPart = question.multiSelect ? `${checkbox} ` : "";
    const optionLine = `${prefix}${checkboxPart}${label} ${desc}`;
    const wrappedOption = wrapTextWithAnsi(optionLine, width - 4);

    for (let j = 0; j < wrappedOption.length; j++) {
      const wrappedLine = wrappedOption[j];
      if (!wrappedLine) {
        throw new Error(`Invalid wrapped line index: ${j}`);
      }
      lines.push(contentLine(theme, width, wrappedLine));
    }
  }
}

// ---------------------------------------------------------------------------
// renderOptionsWithPreview (side-by-side)
// ---------------------------------------------------------------------------

function renderOptionsWithPreview(
  width: number,
  question: Question,
  allOptions: OptionItem[],
  state: ComponentState,
  theme: Theme,
  lines: string[],
): void {
  const contentWidth = width - 4; // between "│ " and " │"
  const leftWidth = Math.max(20, Math.min(40, Math.floor(contentWidth * 0.35)));
  const rightWidth = Math.max(1, contentWidth - leftWidth - 1); // -1 for the │ divider

  // Build left column: one line per option
  const leftLines: string[] = [];
  const currentAnswers = state.answers[state.currentIndex] ?? [];
  for (let i = 0; i < allOptions.length; i++) {
    const opt = allOptions[i];
    if (!opt) continue;
    const isHighlighted = i === state.highlightIndex;
    const isSelected = opt.isOther
      ? currentAnswers.some((s) => s.startsWith("Other:"))
      : currentAnswers.includes(opt.label);

    const prefix = isHighlighted ? theme.fg("accent", "▶ ") : "  ";
    const isRecommended = opt.label.endsWith("(Recommended)");
    let label: string;
    if (isHighlighted) {
      label = theme.fg("accent", opt.label);
    } else if (isSelected) {
      label = theme.fg("success", opt.label);
    } else if (isRecommended) {
      label = theme.fg("accent", opt.label);
    } else if (opt.isChatAboutThis) {
      label = theme.fg("muted", opt.label);
    } else {
      label = theme.fg("text", opt.label);
    }
    const line = `${prefix}${label}`;
    leftLines.push(truncateToWidth(line, leftWidth));
    if (isHighlighted && opt.description) {
      const desc = theme.fg("muted", `  ${opt.description}`);
      for (const dl of wrapTextWithAnsi(desc, leftWidth - 2)) {
        leftLines.push(truncateToWidth(`  ${dl}`, leftWidth));
      }
    }
  }

  // Build right column: preview of highlighted option, word-wrapped
  const highlightedOpt = allOptions[state.highlightIndex];
  const previewText = highlightedOpt?.preview ?? "";
  const rightLines =
    previewText.trim().length > 0
      ? wrapTextWithAnsi(previewText, rightWidth)
      : [theme.fg("muted", "(no preview)")];

  const maxRows = Math.max(leftLines.length, rightLines.length);
  const divider = theme.fg("border", "│");

  for (let i = 0; i < maxRows; i++) {
    const leftCell = leftLines[i] ?? "";
    const rightCell = rightLines[i] ?? "";
    const leftPadded =
      leftCell + " ".repeat(Math.max(0, leftWidth - visibleWidth(leftCell)));
    const rightPadded =
      rightCell + " ".repeat(Math.max(0, rightWidth - visibleWidth(rightCell)));

    const row =
      theme.fg("border", "│") +
      " " +
      leftPadded +
      divider +
      rightPadded +
      " " +
      theme.fg("border", "│");
    lines.push(truncateToWidth(row, width));
  }

  // Notes indicator for current question
  if (state.notes[question.question]) {
    const noteLine = `  ${theme.fg("warning", "Notes: ")}${theme.fg("muted", state.notes[question.question] ?? "")}`;
    lines.push(contentLine(theme, width, noteLine));
  }
}

// ---------------------------------------------------------------------------
// renderTextInputScreen (other-input and notes-input)
// ---------------------------------------------------------------------------

function renderTextInputScreen(
  width: number,
  questions: Question[],
  state: ComponentState,
  theme: Theme,
  autocompleteList: SelectList | null,
): string[] {
  const lines: string[] = [];
  const question = questions[state.currentIndex];
  if (!question) {
    throw new Error(`Invalid current index: ${state.currentIndex}`);
  }

  const contentWidth = width - 4;

  renderQuestionHeader(
    width,
    question,
    questions,
    state.currentIndex,
    theme,
    lines,
  );

  const prefix =
    state.mode === "notes-input"
      ? theme.fg("warning", "Notes: ")
      : theme.fg("warning", "Other: ");
  const prefixWidth = visibleWidth(prefix);
  const indentSpaces = " ".repeat(prefixWidth);

  for (let lineIdx = 0; lineIdx < state.otherLines.length; lineIdx++) {
    const lineText = state.otherLines[lineIdx];
    if (lineText === undefined) {
      throw new Error(`Invalid line index: ${lineIdx}`);
    }
    const isCurrentLine = lineIdx === state.otherCursorLine;
    const linePrefix = lineIdx === 0 ? prefix : indentSpaces;

    let inputDisplay: string;
    if (isCurrentLine) {
      const beforeCursor = lineText.slice(0, state.otherCursorCol);
      const afterCursor = lineText.slice(state.otherCursorCol);
      const cursorCharRaw = afterCursor[0];
      const cursorChar = cursorCharRaw !== undefined ? cursorCharRaw : " ";
      const afterCursorRest =
        afterCursor.length > 0 ? afterCursor.slice(1) : "";
      inputDisplay = `${beforeCursor}\x1b[7m${cursorChar}\x1b[27m${afterCursorRest}`;
    } else {
      inputDisplay = lineText;
    }

    const fullLine = linePrefix + inputDisplay;
    const wrappedInput = wrapTextWithAnsi(fullLine, contentWidth);

    for (const wrappedLine of wrappedInput) {
      const padNeeded = Math.max(0, contentWidth - visibleWidth(wrappedLine));
      const paddedLine =
        theme.fg("border", "│") +
        " " +
        wrappedLine +
        " ".repeat(padNeeded) +
        " " +
        theme.fg("border", "│");
      lines.push(truncateToWidth(paddedLine, width));
    }
  }

  if (autocompleteList !== null) {
    const autocompleteLines = autocompleteList.render(contentWidth);
    for (const acLine of autocompleteLines) {
      const padNeeded = Math.max(0, contentWidth - visibleWidth(acLine));
      const paddedLine =
        theme.fg("border", "│") +
        " " +
        acLine +
        " ".repeat(padNeeded) +
        " " +
        theme.fg("border", "│");
      lines.push(truncateToWidth(paddedLine, width));
    }
  }

  lines.push(emptyLine(theme, width));
  lines.push(borderLine(theme, width, "├", "┤", "─"));

  const controlsText = "Enter confirm · Shift+Enter newline · Esc cancel";
  lines.push(contentLine(theme, width, theme.fg("dim", controlsText)));
  lines.push(borderLine(theme, width, "╰", "╯", "─"));

  return lines;
}

// ---------------------------------------------------------------------------
// renderConfirmScreen
// ---------------------------------------------------------------------------

function renderConfirmScreen(
  width: number,
  questions: Question[],
  state: ComponentState,
  theme: Theme,
): string[] {
  const lines: string[] = [];

  lines.push(
    theme.fg("border", "╭") +
      theme.fg("border", "─ Review ") +
      theme.fg("border", "─".repeat(Math.max(1, width - 11))) +
      theme.fg("border", "╮"),
  );
  lines.push(emptyLine(theme, width));

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q) continue;
    const ans = state.answers[i] ?? [];

    const headerStr = theme.fg("accent", `[${q.header}]`);
    const questionStr = theme.fg("text", q.question);
    const wrappedQuestion = wrapTextWithAnsi(
      `${headerStr} ${questionStr}`,
      width - 4,
    );
    for (const line of wrappedQuestion) {
      lines.push(contentLine(theme, width, line));
    }

    const answerStr = ans.length > 0 ? ans.join(", ") : "(none)";
    const answerLine =
      theme.fg("success", "→ ") + theme.fg("accent", answerStr);
    const wrappedAnswer = wrapTextWithAnsi(answerLine, width - 4);
    for (const line of wrappedAnswer) {
      lines.push(contentLine(theme, width, line));
    }

    const note = state.notes[q.question];
    if (note) {
      const noteLine = `  ${theme.fg("warning", "Notes: ")}${theme.fg("muted", note)}`;
      const wrappedNote = wrapTextWithAnsi(noteLine, width - 4);
      for (const line of wrappedNote) {
        lines.push(contentLine(theme, width, line));
      }
    }

    if (i < questions.length - 1) {
      lines.push(emptyLine(theme, width));
    }
  }

  lines.push(emptyLine(theme, width));
  lines.push(borderLine(theme, width, "├", "┤", "─"));

  const controlsText = "Enter submit · c chat about this · Esc go back";
  lines.push(contentLine(theme, width, theme.fg("dim", controlsText)));
  lines.push(borderLine(theme, width, "╰", "╯", "─"));

  return lines;
}

// ---------------------------------------------------------------------------
// Input handlers
// ---------------------------------------------------------------------------

function handleQuestionInput(
  data: string,
  state: ComponentState,
  questions: Question[],
  tui: { requestRender: () => void },
  done: (result: ExecuteResult | null) => void,
): void {
  const question = questions[state.currentIndex];
  if (!question) {
    throw new Error(`Invalid current index: ${state.currentIndex}`);
  }
  const allOptions = buildAllOptions(question);

  if (matchesKey(data, Key.escape)) {
    done(null);
    return;
  }

  if (matchesKey(data, Key.tab)) {
    state.currentIndex = (state.currentIndex + 1) % questions.length;
    state.highlightIndex = 0;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.shift("tab"))) {
    state.currentIndex =
      (state.currentIndex - 1 + questions.length) % questions.length;
    state.highlightIndex = 0;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.up)) {
    state.highlightIndex =
      (state.highlightIndex - 1 + allOptions.length) % allOptions.length;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.down)) {
    state.highlightIndex = (state.highlightIndex + 1) % allOptions.length;
    tui.requestRender();
    return;
  }

  // Number keys: quick-select 1-indexed option
  if (/^[1-9]$/.test(data)) {
    const idx = Number.parseInt(data, 10) - 1;
    if (idx >= 0 && idx < allOptions.length) {
      state.highlightIndex = idx;
      const highlighted = allOptions[idx];
      if (highlighted && !highlighted.isOther && !highlighted.isChatAboutThis) {
        if (question.multiSelect) {
          const currentAnswers = state.answers[state.currentIndex] ?? [];
          const existing = currentAnswers.indexOf(highlighted.label);
          if (existing >= 0) {
            currentAnswers.splice(existing, 1);
          } else {
            currentAnswers.push(highlighted.label);
          }
        } else {
          state.answers[state.currentIndex] = [highlighted.label];
          moveToNextQuestion(state, questions);
        }
        tui.requestRender();
        return;
      }
    }
    tui.requestRender();
    return;
  }

  // n: open notes input
  if (data === "n") {
    const existingNote = state.notes[question.question] ?? "";
    state.otherLines = existingNote ? existingNote.split("\n") : [""];
    state.otherCursorLine = state.otherLines.length - 1;
    const lastLine = state.otherLines[state.otherCursorLine] ?? "";
    state.otherCursorCol = lastLine.length;
    state.mode = "notes-input";
    tui.requestRender();
    return;
  }

  if (question.multiSelect && matchesKey(data, Key.space)) {
    const highlighted = allOptions[state.highlightIndex];
    if (!highlighted) {
      throw new Error(`Invalid highlight index: ${state.highlightIndex}`);
    }
    const currentAnswers = state.answers[state.currentIndex];
    if (!currentAnswers) {
      throw new Error(
        `Invalid current index for answers: ${state.currentIndex}`,
      );
    }

    if (highlighted.isChatAboutThis) {
      // no-op for space in multiselect
    } else if (highlighted.isOther) {
      const hasOther = currentAnswers.some((s) => s.startsWith("Other:"));
      if (hasOther) {
        state.answers[state.currentIndex] = currentAnswers.filter(
          (s) => !s.startsWith("Other:"),
        );
      } else {
        state.mode = "other-input";
        resetTextInput(state);
      }
    } else {
      const idx = currentAnswers.indexOf(highlighted.label);
      if (idx >= 0) {
        currentAnswers.splice(idx, 1);
      } else {
        currentAnswers.push(highlighted.label);
      }
    }
    tui.requestRender();
    return;
  }

  if (!question.multiSelect && matchesKey(data, Key.enter)) {
    const highlighted = allOptions[state.highlightIndex];
    if (!highlighted) {
      throw new Error(`Invalid highlight index: ${state.highlightIndex}`);
    }

    if (highlighted.isChatAboutThis) {
      done(buildChatAboutThisResult(state, questions));
      return;
    }

    if (highlighted.isOther) {
      state.mode = "other-input";
      resetTextInput(state);
    } else {
      state.answers[state.currentIndex] = [highlighted.label];
      moveToNextQuestion(state, questions);
    }
    tui.requestRender();
    return;
  }

  if (question.multiSelect && matchesKey(data, Key.enter)) {
    const currentAnswers = state.answers[state.currentIndex];
    if (!currentAnswers) {
      throw new Error(
        `Invalid current index for answers: ${state.currentIndex}`,
      );
    }
    if (currentAnswers.length === 0) {
      state.answers[state.currentIndex] = ["(none)"];
    }
    moveToNextQuestion(state, questions);
    tui.requestRender();
    return;
  }
}

function handleTextInput(
  data: string,
  state: ComponentState,
  questions: Question[],
  tui: { requestRender: () => void },
  autocompleteProvider: CombinedAutocompleteProvider,
  selectListTheme: SelectListTheme,
  getAutocompleteList: () => SelectList | null,
  setAutocompleteList: (list: SelectList | null) => void,
  getAutocompletePrefix: () => string,
  setAutocompletePrefix: (prefix: string) => void,
): void {
  const autocompleteList = getAutocompleteList();
  const isNotes = state.mode === "notes-input";

  if (matchesKey(data, Key.escape)) {
    if (autocompleteList !== null) {
      setAutocompleteList(null);
      setAutocompletePrefix("");
    } else {
      state.mode = "question";
      resetTextInput(state);
    }
    tui.requestRender();
    return;
  }

  if (autocompleteList !== null && matchesKey(data, Key.up)) {
    autocompleteList.handleInput(data);
    tui.requestRender();
    return;
  }
  if (autocompleteList !== null && matchesKey(data, Key.down)) {
    autocompleteList.handleInput(data);
    tui.requestRender();
    return;
  }

  if (
    autocompleteList !== null &&
    (matchesKey(data, Key.tab) || matchesKey(data, Key.enter))
  ) {
    const selectedItem = autocompleteList.getSelectedItem();
    if (selectedItem !== null) {
      const prefix = getAutocompletePrefix();
      const result = autocompleteProvider.applyCompletion(
        state.otherLines,
        state.otherCursorLine,
        state.otherCursorCol,
        selectedItem,
        prefix,
      );
      state.otherLines = result.lines;
      state.otherCursorLine = result.cursorLine;
      state.otherCursorCol = result.cursorCol;
    }
    setAutocompleteList(null);
    setAutocompletePrefix("");
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.enter)) {
    const text = state.otherLines.join("\n");
    const question = questions[state.currentIndex];
    if (!question) {
      throw new Error(`Invalid current index: ${state.currentIndex}`);
    }

    if (isNotes) {
      if (text.trim()) {
        state.notes[question.question] = text;
      } else {
        delete state.notes[question.question];
      }
      state.mode = "question";
      resetTextInput(state);
    } else {
      const currentAnswers = state.answers[state.currentIndex];
      if (!currentAnswers) {
        throw new Error(
          `Invalid current index for answers: ${state.currentIndex}`,
        );
      }
      if (text.trim()) {
        currentAnswers.push(`Other: ${text}`);
      }
      resetTextInput(state);
      if (!question.multiSelect) {
        state.mode = "question";
        moveToNextQuestion(state, questions);
      } else {
        state.mode = "question";
      }
    }
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.shift("enter"))) {
    const currentLine = state.otherLines[state.otherCursorLine];
    if (currentLine === undefined) {
      throw new Error(`Invalid cursor line: ${state.otherCursorLine}`);
    }
    const beforeCursor = currentLine.slice(0, state.otherCursorCol);
    const afterCursor = currentLine.slice(state.otherCursorCol);
    state.otherLines[state.otherCursorLine] = beforeCursor;
    state.otherLines.splice(state.otherCursorLine + 1, 0, afterCursor);
    state.otherCursorLine++;
    state.otherCursorCol = 0;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.ctrl("d"))) {
    setAutocompleteList(null);
    setAutocompletePrefix("");
    resetTextInput(state);
    state.mode = "question";
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.backspace)) {
    if (state.otherCursorCol > 0) {
      const currentLine = state.otherLines[state.otherCursorLine];
      if (currentLine === undefined) {
        throw new Error(`Invalid cursor line: ${state.otherCursorLine}`);
      }
      state.otherLines[state.otherCursorLine] =
        currentLine.slice(0, state.otherCursorCol - 1) +
        currentLine.slice(state.otherCursorCol);
      state.otherCursorCol--;
    } else if (state.otherCursorLine > 0) {
      const prevLine = state.otherLines[state.otherCursorLine - 1];
      const currentLine = state.otherLines[state.otherCursorLine];
      if (prevLine === undefined || currentLine === undefined) {
        throw new Error(`Invalid cursor line: ${state.otherCursorLine}`);
      }
      const newCol = prevLine.length;
      state.otherLines[state.otherCursorLine - 1] = prevLine + currentLine;
      state.otherLines.splice(state.otherCursorLine, 1);
      state.otherCursorLine--;
      state.otherCursorCol = newCol;
    }
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.ctrl("a")) || matchesKey(data, Key.home)) {
    state.otherCursorCol = 0;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.ctrl("e")) || matchesKey(data, Key.end)) {
    const currentLine = state.otherLines[state.otherCursorLine];
    if (currentLine !== undefined) {
      state.otherCursorCol = currentLine.length;
    }
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.ctrl("w"))) {
    const currentLine = state.otherLines[state.otherCursorLine];
    if (currentLine === undefined) {
      throw new Error(`Invalid cursor line: ${state.otherCursorLine}`);
    }
    const before = currentLine.slice(0, state.otherCursorCol);
    const trimmed = before.replace(/\s+$/, "");
    const lastSpace = trimmed.lastIndexOf(" ");
    const newPos = lastSpace === -1 ? 0 : lastSpace + 1;
    state.otherLines[state.otherCursorLine] =
      currentLine.slice(0, newPos) + currentLine.slice(state.otherCursorCol);
    state.otherCursorCol = newPos;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.ctrl("u"))) {
    const currentLine = state.otherLines[state.otherCursorLine];
    if (currentLine === undefined) {
      throw new Error(`Invalid cursor line: ${state.otherCursorLine}`);
    }
    state.otherLines[state.otherCursorLine] = currentLine.slice(
      state.otherCursorCol,
    );
    state.otherCursorCol = 0;
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.ctrl("k"))) {
    const currentLine = state.otherLines[state.otherCursorLine];
    if (currentLine === undefined) {
      throw new Error(`Invalid cursor line: ${state.otherCursorLine}`);
    }
    state.otherLines[state.otherCursorLine] = currentLine.slice(
      0,
      state.otherCursorCol,
    );
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.up)) {
    if (state.otherCursorLine > 0) {
      state.otherCursorLine--;
      const prevLine = state.otherLines[state.otherCursorLine];
      if (prevLine !== undefined) {
        state.otherCursorCol = Math.min(state.otherCursorCol, prevLine.length);
      }
    }
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.down)) {
    if (state.otherCursorLine < state.otherLines.length - 1) {
      state.otherCursorLine++;
      const nextLine = state.otherLines[state.otherCursorLine];
      if (nextLine !== undefined) {
        state.otherCursorCol = Math.min(state.otherCursorCol, nextLine.length);
      }
    }
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.left)) {
    if (state.otherCursorCol > 0) {
      state.otherCursorCol--;
    } else if (state.otherCursorLine > 0) {
      state.otherCursorLine--;
      const prevLine = state.otherLines[state.otherCursorLine];
      if (prevLine !== undefined) {
        state.otherCursorCol = prevLine.length;
      }
    }
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.right)) {
    const currentLine = state.otherLines[state.otherCursorLine];
    if (
      currentLine !== undefined &&
      state.otherCursorCol < currentLine.length
    ) {
      state.otherCursorCol++;
    } else if (state.otherCursorLine < state.otherLines.length - 1) {
      state.otherCursorLine++;
      state.otherCursorCol = 0;
    }
    tui.requestRender();
    return;
  }

  if (matchesKey(data, Key.tab)) {
    const forced = autocompleteProvider.getForceFileSuggestions(
      state.otherLines,
      state.otherCursorLine,
      state.otherCursorCol,
    );
    if (forced !== null && forced.items.length > 0) {
      if (forced.items.length === 1) {
        const result = autocompleteProvider.applyCompletion(
          state.otherLines,
          state.otherCursorLine,
          state.otherCursorCol,
          // biome-ignore lint/style/noNonNullAssertion: length checked above
          forced.items[0]!,
          forced.prefix,
        );
        state.otherLines = result.lines;
        state.otherCursorLine = result.cursorLine;
        state.otherCursorCol = result.cursorCol;
        setAutocompleteList(null);
        setAutocompletePrefix("");
      } else {
        setAutocompleteList(new SelectList(forced.items, 6, selectListTheme));
        setAutocompletePrefix(forced.prefix);
      }
    }
    tui.requestRender();
    return;
  }

  const printable = data
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally filtering control chars
    .replace(/\x1b\[200~/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally filtering control chars
    .replace(/\x1b\[201~/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally filtering control chars
    .replace(/[\x00-\x1f\x7f]/g, "");
  if (printable.length > 0) {
    const currentLine = state.otherLines[state.otherCursorLine];
    if (currentLine === undefined) {
      throw new Error(`Invalid cursor line: ${state.otherCursorLine}`);
    }
    state.otherLines[state.otherCursorLine] =
      currentLine.slice(0, state.otherCursorCol) +
      printable +
      currentLine.slice(state.otherCursorCol);
    state.otherCursorCol += printable.length;
    if (printable.endsWith("@") || getAutocompleteList() !== null) {
      updateAutocomplete(
        state,
        autocompleteProvider,
        selectListTheme,
        setAutocompleteList,
        setAutocompletePrefix,
      );
    }
    tui.requestRender();
    return;
  }
}

function handleConfirmInput(
  data: string,
  state: ComponentState,
  params: Params,
  tui: { requestRender: () => void },
  done: (result: ExecuteResult | null) => void,
): void {
  if (matchesKey(data, Key.escape)) {
    state.mode = "question";
    state.currentIndex = params.questions.length - 1;
    state.highlightIndex = 0;
    tui.requestRender();
    return;
  }

  if (data === "c" || data === "C") {
    done(buildChatAboutThisResult(state, params.questions as Question[]));
    return;
  }

  if (matchesKey(data, Key.enter)) {
    done(buildSubmitResult(state, params.questions as Question[]));
    return;
  }
}

// ---------------------------------------------------------------------------
// Result builders
// ---------------------------------------------------------------------------

function buildAnswersRecord(
  state: ComponentState,
  questions: Question[],
): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q) continue;
    const selections = state.answers[i] ?? [];
    record[q.question] = selections.join(", ");
  }
  return record;
}

function buildAnnotations(
  state: ComponentState,
  questions: Question[],
): Record<string, Annotation> | undefined {
  const annotations: Record<string, Annotation> = {};
  let hasAny = false;

  for (const q of questions) {
    const note = state.notes[q.question];
    const annotation: Annotation = {};

    if (note) {
      annotation.notes = note;
      hasAny = true;
    }

    // Add preview of selected option if applicable
    if (!q.multiSelect) {
      const idx = questions.indexOf(q);
      const selections = state.answers[idx] ?? [];
      if (selections.length > 0) {
        const selectedLabel = selections[0];
        const matchedOpt = q.options.find(
          (opt) => opt.label === selectedLabel,
        ) as QuestionOption | undefined;
        if (matchedOpt?.preview) {
          annotation.preview = matchedOpt.preview;
          hasAny = true;
        }
      }
    }

    if (Object.keys(annotation).length > 0) {
      annotations[q.question] = annotation;
    }
  }

  return hasAny ? annotations : undefined;
}

function buildContentText(
  answers: Record<string, string>,
  annotations: Record<string, Annotation> | undefined,
): string {
  const pairs = Object.entries(answers)
    .map(([q, a]) => `"${q}" = "${a}"`)
    .join(", ");
  let text = `User has answered your questions: ${pairs}. You can now continue with the user's answers in mind.`;

  if (annotations) {
    for (const [q, ann] of Object.entries(annotations)) {
      if (ann.preview) {
        text += `\n\nselected preview for "${q}":\n${ann.preview}`;
      }
      if (ann.notes) {
        text += `\n\nuser notes for "${q}": ${ann.notes}`;
      }
    }
  }

  return text;
}

function buildSubmitResult(
  state: ComponentState,
  questions: Question[],
): ExecuteResult {
  const answers = buildAnswersRecord(state, questions);
  const annotations = buildAnnotations(state, questions);
  const text = buildContentText(answers, annotations);

  return {
    content: [{ type: "text", text }],
    details: { questions, answers, annotations },
  };
}

function buildChatAboutThisResult(
  state: ComponentState,
  questions: Question[],
): ExecuteResult {
  const questionLines = questions
    .map((q, idx) => {
      const selections = state.answers[idx] ?? [];
      const answer =
        selections.length > 0
          ? `  Answer: ${selections.join(", ")}`
          : "  (No answer provided)";
      return `- "${q.question}"\n${answer}`;
    })
    .join("\n");

  const text = `The user wants to clarify these questions.\nThis means they may have additional information, context or questions for you.\nTake their response into account and then reformulate the questions if appropriate.\nStart by asking them what they would like to clarify.\n\nQuestions asked:\n${questionLines}`;

  const answers = buildAnswersRecord(state, questions);

  return {
    content: [{ type: "text", text }],
    details: { questions, answers, chatAboutThis: true },
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function resetTextInput(state: ComponentState): void {
  state.otherLines = [""];
  state.otherCursorLine = 0;
  state.otherCursorCol = 0;
}

function updateAutocomplete(
  state: ComponentState,
  autocompleteProvider: CombinedAutocompleteProvider,
  selectListTheme: SelectListTheme,
  setAutocompleteList: (list: SelectList | null) => void,
  setAutocompletePrefix: (prefix: string) => void,
): void {
  const suggestions = autocompleteProvider.getSuggestions(
    state.otherLines,
    state.otherCursorLine,
    state.otherCursorCol,
  );
  if (suggestions !== null && suggestions.items.length > 0) {
    setAutocompleteList(new SelectList(suggestions.items, 6, selectListTheme));
    setAutocompletePrefix(suggestions.prefix);
  } else {
    setAutocompleteList(null);
    setAutocompletePrefix("");
  }
}

function moveToNextQuestion(
  state: ComponentState,
  questions: Question[],
): void {
  if (state.currentIndex < questions.length - 1) {
    state.currentIndex++;
    state.highlightIndex = 0;
  } else {
    state.mode = "confirm";
  }
}
