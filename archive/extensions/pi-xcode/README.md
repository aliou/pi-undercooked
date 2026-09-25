# pi-xcode

Pi extension for iOS Xcode workflows.

Status: rewrite in progress. v0.1.0 contract is defined and implemented with split tools.

## Installation

```bash
pi install git:github.com/aliou/pi-xcode
```

## Tools

- `xcode_project`
  - actions: `inspect`, `list_schemes`, `list_targets`, `resolve_uitest_scheme`, `doctor`
- `xcode_build`
  - actions: `build`, `build_install`, `build_run`, `clean`
- `xcode_simulator`
  - actions: `list`, `status`, `boot`, `shutdown`, `erase`, `install`, `launch`, `terminate`, `uninstall`, `screenshot`
- `xcode_ui`
  - actions: `describe_ui`, `tap`, `type`, `clear_text`, `swipe`, `scroll`, `wait_for`, `assert`, `query_controls`, `query_text`, `screenshot`, `chain_actions`

## Command

- `/xcode:setup` validates local Xcode/simulator/harness setup.

## UI harness contract (`xcode_ui`)

For non-screenshot actions, the tool executes a harness command (default `bash tools/ui-automation-runner.sh` if present):

- JSON payload is sent on `stdin`
- harness must return JSON on `stdout`

Expected response shape:

```json
{
  "ok": true,
  "summary": "Tapped save-button",
  "steps": []
}
```

For chain failures:

```json
{
  "ok": false,
  "error": "Assertion failed: tooltip not visible",
  "failedAt": 3,
  "steps": [
    { "name": "open menu", "status": "passed" },
    { "name": "hold item", "status": "failed", "error": "tooltip not visible" }
  ]
}
```

## Development

```bash
nix-shell
pnpm install
pnpm lint
pnpm typecheck
```
