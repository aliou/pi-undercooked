# Pi Chrome Integration

Chrome sidepanel integration for Pi with browser automation tools.

## What it includes

- Chrome extension (MV3) with React sidepanel UI
- Native messaging host bridge (`native-host/host.cjs`)
- Pi extension registering browser tools (`pi-extension/`)
- Browser RPC methods for tabs, page interactions, screenshots, and debug reads

## Workspace commands

From repo root:

```bash
pnpm chrome:dev
pnpm chrome:build
```

Or inside `integrations/chrome`:

```bash
pnpm dev
pnpm build
pnpm build:dev
```

## Install + run locally

1. Build once:

```bash
pnpm chrome:build
```

2. Load extension:
   - Production build output: `integrations/chrome/dist-prod`
   - Dev build output: `integrations/chrome/dist-dev` (name: `Pi Chrome (dev)` and dev-badged icon)
   - Open your browser extensions page (`chrome://extensions` or `helium://extensions`)
   - Enable Developer mode
   - Load unpacked extension from the build folder you want

3. Install native host manifest (required for Pi bridge):

```bash
cd integrations/chrome/native-host
./install-host.sh <your-extension-id> --browser chrome
# or
./install-host.sh <your-extension-id> --browser helium
```

You can find the extension ID on the Chrome extensions page after loading unpacked.

## Key directories

- `src/background/` - service worker, browser method dispatch, native bridge wiring
- `src/content/` - DOM interaction engine and page reading
- `src/sidepanel/` - chat UI and RPC client hook
- `native-host/` - native messaging host + installer
- `pi-extension/` - Pi tool registrations and browser system prompt
- `docs/` - architecture and protocol docs

## Documentation

- [Docs index](docs/README.md)
- [System communication map](docs/system-communication-map.md)
- [Protocol index and sequences](docs/protocol-index-and-sequences.md)
