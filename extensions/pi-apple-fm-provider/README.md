# @aliou/pi-apple-fm-provider

A Pi extension that adds Apple Foundation Models as a provider, enabling on-device inference through [tsfm](https://github.com/codybrom/tsfm).

No API key. No fees. No network. Runs entirely on-device.

## Requirements

- Mac running macOS 26 (Tahoe) or later on Apple Silicon
- Apple Intelligence enabled in System Settings

## How it works

The extension registers a `streamSimple` provider with Pi. Instead of routing requests through an HTTP endpoint, Pi calls the provider function directly with the full conversation context. The function translates the context into a `tsfm` session call and streams the response back as native Pi events — no local proxy server involved.

## Model

| Model ID | Description |
|---|---|
| `apple-on-device` | Apple on-device Foundation Model |

## Usage

After installing the extension, select the model in Pi's model picker:

```
/model apple-on-device
```

## Limitations

- Context window and max output tokens are estimated conservatively (Apple does not publish exact figures).
- Token usage counts are always zero (Apple does not expose this information).
- Tool calling and image input are not supported in this initial version.
