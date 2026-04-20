# @aliou/pi-evals

## 0.3.0

### Minor Changes

- a942f14: Add built-in `github-models` provider support and auto-load it when `provider: "github-models"` is selected.

  Add reusable CI integrations for other repositories:

  - reusable workflow at `.github/workflows/pi-evals.yml`
  - composite GitHub Action via `uses: aliou/pi-evals@vX.Y.Z`

  Improve eval runtime behavior:

  - merge default and per-eval `extensions` config
  - keep JSON mode output clean for CI parsing

  Update docs and skill guidance for GitHub Models and reusable CI usage.

## 0.2.1

### Patch Changes

- 2e8ccb1: Include pi-evals skill in published package

## 0.2.0

### Minor Changes

- 6178794: Add extension loading support and in-memory sessions

  - Wire `config.extensions` to `DefaultResourceLoader` with `additionalExtensionPaths` in `runPiTask`
  - Use `SessionManager.inMemory()` to avoid polluting user session directory
  - Fix `extractToolCalls` to handle pi SDK's `toolCall` content block type

## 0.1.0

### Minor Changes

- 73e5f92: initial release
