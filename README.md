# pi-undercooked

Monorepo of proof-of-concept and one-off Pi packages that are actively being
tried out. Nothing here is published or considered stable.

## Packages

| Package | Description |
|---|---|
| `nurb` | Tooling around the nurb CLI (agentic CAD for 3D printing): pi extension + skill |

## Archive

`archive/` holds extensions and integrations that are no longer maintained:
`pi-cool-extension`, `pi-crit`, `pi-flowdeck`, `pi-linear`, `pi-playdate`,
`pi-the-dumb-zone`, `pi-xcode`, `poc-linkup-company-research`,
`poc-proof-bridge`, and the `chrome` and `linear` integrations.

Archived code is frozen. It is not typechecked, linted, or updated, and exists
for reference only.

## Development

Dependencies are managed per package via the pnpm workspace. Run
`pnpm install` from the repo root, then work inside any package directory.

```sh
pnpm install
pnpm test        # runs tests across packages
pnpm typecheck   # typechecks across packages
```
