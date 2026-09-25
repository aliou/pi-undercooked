# pi-xcode

This repository is a fresh rewrite of the pi-xcode extension.

## Scope

- iOS only
- Minimal, reliable extension surface first
- No backward compatibility constraints with previous implementation

## Current State

- Template scaffold is in place
- Core metadata renamed to pi-xcode
- Features are being reintroduced incrementally

## Conventions

- Keep implementations small and explicit
- Prefer deterministic CLI-driven Xcode/simulator flows
- Add tests as behavior is introduced
- Keep docs aligned with actual shipped behavior

## Validation

Before committing, run:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm check:lockfile`
