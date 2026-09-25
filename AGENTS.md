# pi-undercooked

Monorepo for proof-of-concept and one-off Pi packages that are actively being
tried out. Nothing here is published or considered stable. Frozen experiments
live in `archive/`.

## Layout

- `packages/<name>/` — live packages. Each package is a pnpm workspace member
  with its own `package.json`, `biome.json`, `tsconfig.json`, and vitest
  setup. A package may contain extensions (`extensions/<name>/`) and skills
  (`skills/<name>/`).
- `archive/` — archived extensions and integrations. Everything in here is
  frozen: do not update, lint, typecheck, or reference it from live code. It
  exists for reference only.

## Adding a new package

Put it in `packages/<name>/`. Each package needs at minimum:

- A `package.json` with a `pi` key pointing to the extension entry files and
  skills:
  ```json
  {
    "name": "@aliou/pi-undercooked-my-package",
    "private": true,
    "type": "module",
    "pi": {
      "extensions": ["./extensions/my-extension/index.ts"]
    }
  }
  ```
- Its own `biome.json` and `tsconfig.json`. Each package manages its own
  linting and type checking.
- Its own `vitest` setup if it has tests.

Peer dependencies (anything Pi injects at runtime: `@earendil-works/pi-ai`,
`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`) should
be listed as optional peers in the package, not installed directly. The
workspace root pins them via pnpm overrides.

Register the package's entry points in the root `package.json` under
`pi.extensions` / `pi.skills` so that installing the whole repo picks it up.

When adding a new package, also add it to the `README.md` packages table.

## Archiving a package

Move it from `packages/` to `archive/extensions/` (or `archive/integrations/`
for non-extension integrations like browser extensions or bridge services),
remove its entry points from the root `package.json` `pi` key, and drop its
workspace membership if it no longer needs deps. Do not fix it up afterwards —
the archive is append-only and not typechecked.

## Reference material

Use existing packages in this repo as inspiration for structure and patterns.
For the full extension development guide, load the `pi-extension` skill from
the `pi-dev-kit` package. Set it up in your `.pi/settings.json`:

```json
{
  "skills": ["pi-extension"]
}
```

## Nix / shell

There is a single `shell.nix` and `.envrc` at the repo root. Do not add
per-package shell files.
