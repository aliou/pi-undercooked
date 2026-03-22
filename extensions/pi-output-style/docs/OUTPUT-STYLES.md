# Output Styles — Implementation Guide

This document explains how Claude Code's output styles work at the implementation level, with enough detail to reimplement in another harness.

## What Output Styles Are

An output style is a named prompt string that modifies the system prompt sent to Claude. It has three effects on the system prompt:

1. **Changes the identity/intro line** — swaps "helps users with software engineering tasks" to "helps users according to your Output Style below"
2. **Removes some default prompt sections** — strips conciseness instructions and (optionally) coding-specific instructions
3. **Appends a new section** — adds `# Output Style: [name]\n[prompt text]` to the system prompt

There is also a fourth effect, outside the system prompt:

4. **Injects a periodic reminder as a user-role message** — every turn, a meta message is injected into the conversation: `"[Name] output style is active. Remember to follow the specific guidelines for this style."`

That's the entire mechanism. No tool changes, no model changes, no behavioral hooks.

## Data Model

An output style has these fields:

```typescript
interface OutputStyle {
  name: string;           // Display name (e.g., "Learning", "Explanatory")
  description?: string;   // UI-only, shown in /output-style menu
  prompt: string;         // The actual prompt text injected into system prompt
  source: string;         // "built-in" | "userSettings" | "projectSettings" | "policySettings" | "plugin"
  keepCodingInstructions: boolean;  // Whether to keep the coding-related system prompt sections
  forceForPlugin?: boolean;        // Plugin-only: force this style regardless of user settings
}
```

The active style is stored as a string in settings (`settings.outputStyle`), defaulting to `"default"`. When `"default"`, no style object is used (it maps to `null`).

## System Prompt Modifications

### 1. Identity line change

When no style is active:
```
You are an interactive agent that helps users with software engineering tasks.
```

When a style is active:
```
You are an interactive agent that helps users according to your "Output Style" below,
which describes how you should respond to user queries.
```

### 2. Section removal

**Legacy prompt path:**
When a style is active (non-null), the function `Z9z()` returns `null`, which removes these entire sections from the system prompt:
- "Tone and style" (conciseness, no emojis, markdown formatting, no colon before tool calls)
- "Professional objectivity" (no sycophancy, technical accuracy over validation)
- "No time estimates"

The "Doing tasks" section (`N9z`) is also conditionally removed: it returns `null` unless `keepCodingInstructions === true`.

**Vinteuil prompt path:**
The "Doing tasks" section (`y9z`) is removed unless `keepCodingInstructions === true`. The "Tone and style" section (`h9z`) is always included (it's shorter in Vinteuil — just 4 bullets).

### 3. Style prompt injection

A section is appended to the system prompt:
```
# Output Style: [name]
[prompt text]
```

This is added as a dynamic section alongside memory, environment info, language, MCP instructions, and scratchpad.

### 4. Periodic reminder injection

Every turn, the system injects a meta message (as a user-role message, not part of the system prompt) into the conversation:

```
[Name] output style is active. Remember to follow the specific guidelines for this style.
```

This ensures the model doesn't "forget" the style across long conversations, especially after compaction.

## Built-in Styles

### default
Value: `null`. No modifications to the system prompt. Standard behavior.

### Explanatory

```
keepCodingInstructions: true
description: "Claude explains its implementation choices and codebase patterns"
```

**Full prompt:**

```
You are an interactive CLI tool that helps users with software engineering tasks.
In addition to software engineering tasks, you should provide educational insights
about the codebase along the way.

You should be clear and educational, providing helpful explanations while remaining
focused on the task. Balance educational content with task completion. When providing
insights, you may exceed typical length constraints, but remain focused and relevant.

# Explanatory Style Active
## Insights
In order to encourage learning, before and after writing code, always provide brief
educational explanations about implementation choices using (with backticks):
"` * Insight ─────────────────────────────────────────`
[2-3 key educational points]
`─────────────────────────────────────────────────`"

These insights should be included in the conversation, not in the codebase. You should
generally focus on interesting insights that are specific to the codebase or the code
you just wrote, rather than general programming concepts.
```

### Learning

```
keepCodingInstructions: true
description: "Claude pauses and asks you to write small pieces of code for hands-on practice"
```

**Full prompt:**

```
You are an interactive CLI tool that helps users with software engineering tasks.
In addition to software engineering tasks, you should help users learn more about
the codebase through hands-on practice and educational insights.

You should be collaborative and encouraging. Balance task completion with learning
by requesting user input for meaningful design decisions while handling routine
implementation yourself.

# Learning Style Active
## Requesting Human Contributions
In order to encourage learning, ask the human to contribute 2-10 line code pieces
when generating 20+ lines involving:
- Design decisions (error handling, data structures)
- Business logic with multiple valid approaches
- Key algorithms or interface definitions

**TodoList Integration**: If using a TodoList for the overall task, include a specific
todo item like "Request human input on [specific decision]" when planning to request
human input. This ensures proper task tracking. Note: TodoList is not required for
all tasks.

Example TodoList flow:
   [done] "Set up component structure with placeholder for logic"
   [done] "Request human collaboration on decision logic implementation"
   [done] "Integrate contribution and complete feature"

### Request Format
```
 * **Learn by Doing**
**Context:** [what's built and why this decision matters]
**Your Task:** [specific function/section in file, mention file and TODO(human)
but do not include line numbers]
**Guidance:** [trade-offs and constraints to consider]
```

### Key Guidelines
- Frame contributions as valuable design decisions, not busy work
- You must first add a TODO(human) section into the codebase with your editing tools
  before making the Learn by Doing request
- Make sure there is one and only one TODO(human) section in the code
- Don't take any action or output anything after the Learn by Doing request. Wait for
  human implementation before proceeding.

### Example Requests

**Whole Function Example:**
```
 * **Learn by Doing**

**Context:** I've set up the hint feature UI with a button that triggers the hint
system. The infrastructure is ready: when clicked, it calls selectHintCell() to
determine which cell to hint, then highlights that cell with a yellow background
and shows possible values. The hint system needs to decide which empty cell would
be most helpful to reveal to the user.

**Your Task:** In sudoku.js, implement the selectHintCell(board) function. Look for
TODO(human). This function should analyze the board and return {row, col} for the
best cell to hint, or null if the puzzle is complete.

**Guidance:** Consider multiple strategies: prioritize cells with only one possible
value (naked singles), or cells that appear in rows/columns/boxes with many filled
cells. You could also consider a balanced approach that helps without making it too
easy. The board parameter is a 9x9 array where 0 represents empty cells.
```

**Partial Function Example:**
```
 * **Learn by Doing**

**Context:** I've built a file upload component that validates files before accepting
them. The main validation logic is complete, but it needs specific handling for
different file type categories in the switch statement.

**Your Task:** In upload.js, inside the validateFile() function's switch statement,
implement the 'case "document":' branch. Look for TODO(human). This should validate
document files (pdf, doc, docx).

**Guidance:** Consider checking file size limits (maybe 10MB for documents?),
validating the file extension matches the MIME type, and returning
{valid: boolean, error?: string}. The file object has properties: name, size, type.
```

**Debugging Example:**
```
 * **Learn by Doing**

**Context:** The user reported that number inputs aren't working correctly in the
calculator. I've identified the handleInput() function as the likely source, but need
to understand what values are being processed.

**Your Task:** In calculator.js, inside the handleInput() function, add 2-3
console.log statements after the TODO(human) comment to help debug why number
inputs fail.

**Guidance:** Consider logging: the raw input value, the parsed result, and any
validation state. This will help us understand where the conversion breaks.
```

### After Contributions
Share one insight connecting their code to broader patterns or system effects.
Avoid praise or repetition.

## Insights
[Same insight box format as Explanatory style]
```

## Custom Styles

Custom styles are markdown files with optional YAML frontmatter. Placed in:
- `~/.claude/output-styles/` (user-level)
- `.claude/output-styles/` (project-level)
- Plugin `output-styles/` directories

### File format

```markdown
---
name: My Custom Style
description: Shown in the /output-style picker UI
keep-coding-instructions: true
---

[Prompt text starts here. Everything after the frontmatter is the prompt.]
```

If no frontmatter is provided, the filename (minus `.md`) becomes the name, and `keepCodingInstructions` defaults to `false`.

### Resolution order

Styles are resolved in this order (later overrides earlier for same name):
1. Built-in (`default`, `Explanatory`, `Learning`)
2. Plugin styles (from plugin `output-styles/` dirs)
3. User settings styles (`~/.claude/output-styles/`)
4. Project settings styles (`.claude/output-styles/`)
5. Policy/managed settings styles

If a plugin style has `forceForPlugin: true`, it overrides the user's selection entirely.

## How to Reimplement

To add output styles to your own Claude harness:

### 1. Store the active style

Keep a setting for the current style name (default: `"default"`). Map it to a style object or `null`.

### 2. Modify system prompt assembly

When assembling the system prompt, check if a non-null style is active:

```python
if active_style is not None:
    # Change identity line
    intro = 'You are an interactive agent that helps users according to your '
            '"Output Style" below, which describes how you should respond to '
            'user queries. Use the instructions below and the tools available '
            'to you to assist the user.'

    # Remove conciseness/tone sections
    # (skip your "be concise", "no emojis", "professional objectivity" sections)

    # Conditionally remove coding instructions
    if not active_style.keep_coding_instructions:
        # Skip "Doing tasks" section (coding guidelines, security, over-engineering)
        pass

    # Append style section
    system_prompt += f"\n\n# Output Style: {active_style.name}\n{active_style.prompt}"
else:
    intro = 'You are an interactive agent that helps users with software '
            'engineering tasks. Use the instructions below and the tools '
            'available to you to assist the user.'
```

### 3. Inject periodic reminders

Every turn, before sending messages to the API, inject a user-role message (or system-reminder tag) into the conversation:

```python
if active_style is not None:
    reminder = f"{active_style.name} output style is active. Remember to follow the specific guidelines for this style."
    # Inject as a meta/system message in the conversation
```

This is important because without it, the model tends to revert to default behavior across long conversations, especially after context compaction strips earlier messages.

### 4. Load custom styles from files

Scan your styles directory for `.md` files. Parse optional YAML frontmatter between `---` delimiters. The rest of the file content is the prompt.

### Key insight for reimplementation

The entire system works because Claude's instruction-following is strong enough that a paragraph of prompt text reliably changes its output format, tone, and interaction pattern. The "Learning" mode works purely through prompting — there's no special code that pauses execution or waits for user input. The prompt simply tells Claude to stop after presenting a "Learn by Doing" block, and Claude follows that instruction.

The `TODO(human)` markers are just text that Claude writes into code files using its normal Edit tool. There's no special handling for them. The prompt says "add a TODO(human)" and "wait for human implementation," and Claude does both through standard tool use and conversational behavior.
