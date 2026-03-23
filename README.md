# pi-undercooked

A collection of Pi extensions that are proof-of-concept, not yet usable, or one-off experiments. These extensions might be useful for reference but are probably out of date. They live here mainly so they can be required and loaded individually when needed.

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
| `poc-incognito` | Save sessions to a custom directory |
| `poc-linkup-company-research` | Company research via Linkup API |
| `poc-playwriter` | Browser automation via Playwriter |
| `poc-proof-bridge` | Local collaboration via Proof bridge |

Each extension has its own `package.json` with a `pi` key pointing to its entry file, so they can be loaded individually.

## Development

Dependencies are managed at the root. Run `pnpm install` from the repo root, then work inside any extension directory.
