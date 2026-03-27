# pi-undercooked

A collection of Pi extensions and integrations that are proof-of-concept, not yet usable, or one-off experiments. These projects might be useful for reference but are probably out of date. They live here mainly so they can be required, loaded, or run individually when needed.

## Extensions

| Extension | Description |
|---|---|
| `pi-apple-fm-provider` | Provider for Apple Foundation Models via on-device inference |
| `pi-crit` | Code review tool backed by Crit |
| `pi-excel` | Reading, querying, and updating Excel files |
| `pi-flowdeck` | iOS development tools via Flowdeck |
| `pi-output-style` | Configurable output style presets |
| `pi-xcode` | Xcode project, build, and simulator management |
| `pi-osc-progress` | Terminal progress bar via OSC 9;4 (iTerm2, Ghostty) |
| `pi-init` | Interactive Pi bootstrap: AGENTS.md, .agents/skills, hooks extension, and `init_questionnaire` tool |
| `poc-incognito` | Save sessions to a custom directory |
| `poc-linkup-company-research` | Company research via Linkup API |
| `poc-playwriter` | Browser automation via Playwriter |
| `poc-proof-bridge` | Local collaboration via Proof bridge |

Each extension has its own `package.json` with a `pi` key pointing to its entry file, so they can be loaded individually.

## Integrations

| Integration | Description |
|---|---|
| `chrome` | Chrome sidepanel integration plus native host bridge for browser automation and sidepanel chat |
| `linear` | Hono bridge from Linear Agent Sessions to in-process Pi SDK sessions |
| `neovim` | Bidirectional Neovim integration for Pi |

Integrations are not regular Pi extension packages. They may include bundled Pi extensions, editor plugins, browser extensions, native hosts, or standalone bridge services.

## Development

Dependencies are managed at the root. Run `pnpm install` from the repo root, then work inside any extension directory.
