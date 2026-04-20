---
name: pi-evals
description: Write and run evals for pi extensions and agent behavior using @aliou/pi-evals. Use when creating eval files, writing custom scorers, configuring eval runs, or testing that pi extensions work correctly.
---

# pi-evals

Eval framework for testing pi coding agent behavior. Runs prompts against pi via `createAgentSession`, then scores the results.

## Quick Start

Install:
```bash
pnpm add -D @aliou/pi-evals
```

Create `pi-evals.config.ts` at the project root:
```typescript
import { defineConfig } from "@aliou/pi-evals";

export default defineConfig({
  defaults: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
  },
  evalsDir: "./evals",
  timeout: 60_000,
});
```

Create an eval file in `evals/`:
```typescript
// evals/hello.eval.ts
import { evaluate, Scorers } from "@aliou/pi-evals";

evaluate("Create hello file", {
  config: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
  },
  data: [
    {
      input: 'Create a file called hello.txt containing "Hello World"',
      expected: { files: { "hello.txt": "Hello World" } },
    },
  ],
  scorers: [Scorers.files()],
  timeout: 30_000,
});
```

Run:
```bash
pnpm pi-evals              # all evals
pnpm pi-evals --filter "hello"  # by name substring
```

## Eval File Structure

Eval files are `*.eval.ts` files in the configured `evalsDir`. Each calls `evaluate()` to register one eval.

```typescript
evaluate("Eval name", {
  config: { model, provider, extensions?, env? },
  data: [{ input, expected?, setup?, timeout? }],
  scorers: [...],
  timeout?: number,
});
```

### Test Cases (`data`)

Each test case runs in an isolated temp directory.

- `input`: prompt sent to the agent
- `expected`: optional expected outcome (used by scorers)
- `setup.files`: files to pre-create in the workspace (`{ "path": "content" }`)
- `setup.commands`: shell commands to run before the eval
- `timeout`: override timeout for this case

### Config (`config`)

- `model`: model name (e.g. `"claude-haiku-4-5"`)
- `provider`: provider name (e.g. `"anthropic"`, `"github-models"`)
- `extensions`: array of extension paths, resolved relative to `process.cwd()`
- `env`: environment variables to set

For GitHub Models, use:

```typescript
config: {
  provider: "github-models",
  model: "gpt-4o",
}
```

`github-models` is bundled in pi-evals and auto-loaded.

## Built-in Scorers

All scorers are accessed via `Scorers.*`:

| Scorer | Description |
|--------|-------------|
| `Scorers.files()` | Checks `expected.files` exist with matching content (substring) |
| `Scorers.outputContains()` | Checks `expected.output` is a substring of agent output |
| `Scorers.outputMatches(regex)` | Checks agent output matches a regex |
| `Scorers.toolCalled(name)` | Checks a tool was called by name |
| `Scorers.toolCalledWith(name, args)` | Checks a tool was called with specific args |
| `Scorers.bash(command, opts?)` | Runs a shell command in the workspace, checks exit code |
| `Scorers.llmJudge({ criteria })` | Uses an LLM to evaluate the output against criteria |

## Custom Scorers

A scorer is an object with `name` and `score(ctx) => ScoreResult`:

```typescript
import type { Scorer } from "@aliou/pi-evals";

const myScorer: Scorer = {
  name: "my_scorer",
  async score(ctx) {
    // ctx.input      - the prompt
    // ctx.output     - agent's final text response
    // ctx.cwd        - workspace directory
    // ctx.toolCalls  - array of { name, args }
    // ctx.messages   - full conversation
    // ctx.expected   - the expected object from the test case
    // ctx.stats      - { tokens: { input, output, total }, cost }
    return {
      name: "my_scorer",
      score: 1,  // 0 to 1, >= 0.5 passes
      reason: "Looks good",
    };
  },
};
```

## Testing Extensions

Pass extension paths in `config.extensions`. Paths resolve relative to `process.cwd()` (the project root), not the temp workspace.

```typescript
evaluate("My extension eval", {
  config: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
    extensions: ["./extensions/my-ext/index.ts"],
  },
  data: [
    { input: "Use the custom tool provided by my extension." },
  ],
  scorers: [Scorers.toolCalled("my_custom_tool")],
});
```

## CLI Options

```
-f, --filter <pattern>   Filter evals by name substring
-t, --threshold <pct>    Minimum pass percentage to exit 0
-c, --config <path>      Config file path (default: pi-evals.config.ts)
-m, --model <model>      Override model (env: PI_EVAL_MODEL)
-p, --provider <name>    Override provider (env: PI_EVAL_PROVIDER)
-v, --verbose            Detailed output
    --json               Output results as JSON
```

## Reusable GitHub Workflow

Other repos can run evals via reusable workflow:

```yaml
jobs:
  evals:
    uses: aliou/pi-evals/.github/workflows/pi-evals.yml@main
    permissions:
      contents: read
      models: read
    secrets: inherit
    with:
      package-manager: npm
      install-command: npm ci
      eval-command: npx pi-evals --json
```

For pnpm repos, switch `package-manager` and `install-command`.

## GitHub Action

Other repos can also call the composite action directly:

```yaml
jobs:
  evals:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      models: read
    steps:
      - uses: actions/checkout@v4
      - uses: aliou/pi-evals@vX.Y.Z
        with:
          package-manager: npm
          install-command: npm ci
          eval-command: npx pi-evals --json
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Replace `vX.Y.Z` with the package version you want to pin.

## Session Behavior

Each eval test case runs in an isolated temp directory. Sessions use in-memory storage and are not persisted to the user's session directory.
