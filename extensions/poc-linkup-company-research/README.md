# pi-linkup-company-research

Company research extension for [Pi](https://buildwithpi.ai/) powered by the Linkup API.

## Features

Grouped company-research tools (middle ground between one mega-tool and 17 micro-tools):

- `linkup_company_profile`
  - focus: `overview`, `products`, `business_model`, `target_market`
- `linkup_company_people`
  - focus: `leadership`, `culture`
- `linkup_company_finance`
  - focus: `financials`, `funding`
- `linkup_company_gtm`
  - focus: `clients`, `partnerships`, `strategy`
- `linkup_company_market`
  - focus: `market`, `competition`
- `linkup_company_intel`
  - focus: `technology`, `news`, `risks`, `esg`

All tools support:

- `company_name`
- `focus`
- `output_format` (`answer` or `structured`)
- optional filters: `from_date`, `to_date`, `include_domains`, `exclude_domains`, `include_images`, `max_results`
- optional depth override: `fast`, `standard`, `deep`

## Installation

```bash
# npm
pi install npm:@aliou/pi-linkup-company-research

# git
pi install git:github.com/aliou/pi-linkup-company-research

# local dev
pi -e ./src/index.ts
```

## Setup

Set your Linkup API key:

```bash
export LINKUP_API_KEY="your-api-key"
```

If the key is missing, tools are not registered and Pi shows a warning.

## Development

```bash
nix-shell --run 'pnpm install'
nix-shell --run 'pnpm typecheck'
nix-shell --run 'pnpm lint'
```
