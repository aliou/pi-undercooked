# pi-nurb

A [pi](https://github.com/earendil-works/pi) extension that wraps the
[nurb](https://github.com/Shpigford/nurb) CLI (agentic CAD for 3D printing) in
first-class LLM tools, plus a pi skill teaching the tool workflow.

## Prerequisites

- `nurb` installed (`uv tool install nurb`)
- `@aliou/pi-processes` installed and enabled: `nurb_serve` hands every spawned
  `nurb dev` server to it via the `processes:command:adopt` event channel, and
  refuses to leave an unmanaged process behind.

## Install

Add to `settings.json`:

```json
{
  "packages": ["git:github.com/aliou/pi-nurb"]
}
```

Or load locally:

```sh
pi -e /path/to/pi-nurb/extensions/nurb/index.ts
```

## Tools

Boring mirrors of the nurb CLI. All output is nurb stdout verbatim; non-zero
exits surface as errors.

| Tool | Wraps |
|---|---|
| `nurb_serve` | `nurb dev`, detached, adopted by pi-processes |
| `nurb_new` | `nurb new <name>` |
| `nurb_build` | `nurb build [part]` |
| `nurb_check` | `nurb check [part] [--strict]` |
| `nurb_inspect` | `nurb inspect [part] [--render]` |
| `nurb_export` | `nurb export [part] [--formats ...]` |
| `nurb_render` | `nurb render [part] [--section ...]`, returns the absolute PNG path |
| `nurb_scan` | `nurb scan <file> [--section ...]` |
| `nurb_compare` | `nurb compare [part] [--against <file>]` |
| `nurb_verify` | `nurb verify [part] [--report]` |
| `nurb_rules` | `nurb rules` |
| `nurb_api` | `nurb api` |

Deliberately not wrapped (run them via bash): `slice`, `stress`, `extract`,
`card`, `diff`, `update`, `launcher`, `skill`.

Every tool lazily checks for the `nurb` binary on first call. All tools
except `nurb_new`, `nurb_serve`, `nurb_scan`, `nurb_rules` and `nurb_api`
require a `parts/` directory in the working directory (scan, rules and api
work without a project, matching the underlying CLI). Project tools run
sequentially; scan/rules/api stay parallel.

`nurb dev` is POSIX-only (process-group kill); `nurb_serve` refuses to run on
Windows.

## Skill

`skills/nurb-pi` teaches the workflow: serve first and share the URL with the
user, loop new → edit → build → check → export, render and actually look at
the PNG, and defer to `nurb_rules`/`nurb_api` output as the source of truth.

## Development

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```
