# pi-evals

Eval framework for the Pi coding agent.

Not published. Local package in `pi-undercooked/extensions/pi-evals`.

## Quick Start

Create an eval file in `evals/`:

```typescript
// evals/hello.eval.ts
import { evaluate, Scorers } from "@aliou/pi-undercooked-pi-evals";

evaluate("Create hello file", {
  config: {
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
  },
  data: [
    {
      input: 'Create a file called hello.txt containing "Hello World"',
      expected: { files: { "hello.txt": "Hello World" } },
    },
  ],
  scorers: [Scorers.files()],
});
```

Run evals:

```bash
npx pi-evals
```

## Configuration

Create `pi-evals.config.ts`:

```typescript
import { defineConfig } from "@aliou/pi-undercooked-pi-evals";

export default defineConfig({
  defaults: {
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
  },
  evalsDir: "./evals",
  delayBetweenTests: 500,
  timeout: 60_000,
  warnTestCount: 30,
});
```

## CLI Options

```
pi-evals [options]

Options:
  -h, --help              Show help
  -f, --filter <pattern>  Filter evals by name
  -t, --threshold <pct>   Minimum pass percentage to exit 0
  -c, --config <path>     Config file path
  -m, --model <model>     Override model
  -p, --provider <name>   Override provider
  -v, --verbose           Verbose output
  --json                  Output results as JSON

Environment Variables:
  PI_EVAL_MODEL           Override model (lower priority than -m)
  PI_EVAL_PROVIDER        Override provider (lower priority than -p)
```

Examples:
```bash
pi-evals                                # Run all evals
pi-evals -p github-models -m gpt-4o     # Use GitHub Models
PI_EVAL_PROVIDER=github-models pi-evals # Via env var
```

## Built-in Scorers

### `Scorers.files()`

Checks that expected files exist with expected content.

```typescript
{
  expected: { files: { "hello.txt": "Hello World" } },
  scorers: [Scorers.files()],
}
```

### `Scorers.outputContains()`

Checks that the agent's output contains expected substring.

```typescript
{
  expected: { output: "created file" },
  scorers: [Scorers.outputContains()],
}
```

### `Scorers.outputMatches(pattern)`

Checks that the agent's output matches a regex.

```typescript
{
  scorers: [Scorers.outputMatches(/function \w+\(/)],
}
```

### `Scorers.bash(command, options?)`

Runs a command and checks the exit code.

```typescript
{
  scorers: [Scorers.bash("npm test")],
}
```

Options:
- `exitCode`: Expected exit code (default: 0)
- `timeout`: Command timeout in ms (default: 30000)

### `Scorers.llmJudge(options)`

Uses an LLM to evaluate the output.

```typescript
{
  scorers: [
    Scorers.llmJudge({
      criteria: "The response correctly explains the solution",
      model: "gpt-4o-mini", // optional
      provider: "openai", // optional
    }),
  ],
}
```

## Test Case Options

```typescript
{
  input: "Create a file",
  expected: { files: { "file.txt": "content" } },
  setup: {
    files: { "existing.txt": "existing content" },
    commands: ["npm init -y"],
  },
  timeout: 30_000,
  only: false, // Run only this test
  skip: false, // Skip this test
}
```

## Custom Scorers

```typescript
const customScorer: Scorer = {
  name: "custom",
  score: async (ctx) => {
    const fileExists = await fs.access(path.join(ctx.cwd, "output.txt"))
      .then(() => true)
      .catch(() => false);

    return {
      name: "custom",
      score: fileExists ? 1 : 0,
      reason: fileExists ? "File exists" : "File not found",
    };
  },
};
```

## CI Integration

### GitHub Models (built in)

`github-models` support is built in. No repo-local extension file required.

```typescript
export default defineConfig({
  defaults: {
    provider: "github-models",
    model: "gpt-4o",
  },
});
```

For GitHub Actions, grant model permission and pass `GITHUB_TOKEN`:

```yaml
permissions:
  contents: read
  models: read

- name: Run evals
  env:
    PI_EVAL_PROVIDER: github-models
    PI_EVAL_MODEL: gpt-4o
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: npx pi-evals --json > results.json
```

### Reusable workflow (for other repos)

Use this repo's reusable workflow:

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

For pnpm projects:

```yaml
with:
  package-manager: pnpm
  install-command: pnpm install --frozen-lockfile
  build-command: pnpm build
  eval-command: npx pi-evals --json
```

### GitHub Action (short `uses: aliou/pi-evals@...`)

You can also call the composite action directly:

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

For pnpm projects, set `package-manager: pnpm` and `install-command: pnpm install --frozen-lockfile`.

## License

MIT
