# pi-apple-fm-provider

## Architecture

Single-file extension (`src/index.ts`). No config, no tools, no commands — just a provider.

## Entry point deviation

No config file. This extension has no user-configurable settings. The entry point is synchronous (no async needed) and registers the provider unconditionally.

## streamSimple approach

Pi's provider system supports a `streamSimple` callback in `ProviderConfig`. When set, Pi calls this function directly for every generation request instead of making HTTP calls to a `baseUrl`. This is the mechanism used here to bridge Pi with `tsfm-sdk` (Apple Foundation Models FFI bindings).

The flow:
1. Pi calls `streamSimple(model, context, options)` with the full conversation context.
2. The function creates an `AssistantMessageEventStream` via `createAssistantMessageEventStream()` from `@mariozechner/pi-ai`.
3. An async IIFE starts the tsfm session and streams deltas via `session.streamResponse()`.
4. Each delta is pushed as a `text_delta` event onto the stream.
5. On completion, a `done` event closes the stream.

`baseUrl` and `apiKey` are required by Pi's `registerProvider` validator whenever `models` are defined, even when `streamSimple` handles all requests. Placeholder values are used.

## Native build scripts

`tsfm-sdk` depends on `koffi` (native FFI bindings). The `pnpm.onlyBuiltDependencies` field in `package.json` allows koffi's build script to run, compiling the prebuilt dylib for the current platform.

## Model ID

The model is registered as `apple-on-device` under the `apple` provider. The full qualified ID as seen by Pi is `apple/apple-on-device`.

## API name

`apple-foundation-models` is used as the custom `api` string. It must not match any `KnownApi` value. It links the `streamSimple` handler to the provider registration inside Pi's model registry.
