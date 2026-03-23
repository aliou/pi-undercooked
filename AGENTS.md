# pi-undercooked

Repository for experimental, proof-of-concept, or one-off Pi extensions. Nothing here is considered stable or published.

## Adding a new extension

Put it in the `extensions/` directory. Each extension needs at minimum:

- A `package.json` with a `pi` key pointing to the entry file:
  ```json
  {
    "name": "@aliou/pi-undercooked-my-extension",
    "private": true,
    "type": "module",
    "pi": {
      "extensions": ["./src/index.ts"]
    }
  }
  ```
  Or just an `index.ts` at the extension root if the extension is trivial.

- Its own `biome.json` and `tsconfig.json`. Each extension manages its own linting and type checking config.

- Its own `vitest` setup if it has tests.

Runtime dependencies go in the root `package.json`. Peer dependencies (anything Pi injects at runtime like `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`, `@sinclair/typebox`) should be listed as optional peers in the root, not installed directly.

Also register the new entry point in the root `package.json` under `pi.extensions` so that installing the whole repo picks it up.

When adding a new extension, also add it to the `README.md` extensions table and update this `AGENTS.md` file if the extension introduces any new patterns or conventions.

## Reference material

Use existing extensions in this repo as inspiration for structure and patterns. For the full extension development guide, load the `pi-extension` skill from the `pi-dev-kit` package. Set it up in your `.pi/settings.json`:

```json
{
  "skills": ["pi-extension"]
}
```

## Nix / shell

There is a single `shell.nix` and `.envrc` at the repo root. Do not add per-extension shell files.
