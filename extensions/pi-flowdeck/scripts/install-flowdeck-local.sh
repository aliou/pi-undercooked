#!/usr/bin/env bash
set -euo pipefail

DOWNLOAD_BASE="https://s3.eu-north-1.amazonaws.com/flowdeck.public/releases/cli"
INSTALL_DIR="$(pwd)/.flowdeck-cli"
CHANNEL="stable"

if [[ "${1:-}" == "--beta" ]]; then
  CHANNEL="beta"
fi

if [[ -n "${FLOWDECK_VERSION:-}" ]]; then
  VERSION="$FLOWDECK_VERSION"
else
  if [[ "$CHANNEL" == "beta" ]]; then
    VERSION="$(curl -fsSL "$DOWNLOAD_BASE/latest-beta.txt")"
  else
    VERSION="$(curl -fsSL "$DOWNLOAD_BASE/latest.txt")"
  fi
fi

OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" != "Darwin" ]]; then
  echo "FlowDeck CLI only supports macOS" >&2
  exit 1
fi

case "$ARCH" in
  x86_64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

URL="$DOWNLOAD_BASE/$VERSION/flowdeck-darwin-$ARCH.tar.gz"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading FlowDeck CLI $VERSION from $URL"
curl -fsSL "$URL" -o "$TMP_DIR/flowdeck.tar.gz"

mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR"/*
tar -xzf "$TMP_DIR/flowdeck.tar.gz" -C "$INSTALL_DIR"

chmod 755 "$INSTALL_DIR/flowdeck"
xattr -d com.apple.quarantine "$INSTALL_DIR/flowdeck" 2>/dev/null || true

if [[ -f "$INSTALL_DIR/resources/flowdeck-guard.sh" ]]; then
  chmod 755 "$INSTALL_DIR/resources/flowdeck-guard.sh"
fi

echo "Installed FlowDeck locally: $INSTALL_DIR/flowdeck"
"$INSTALL_DIR/flowdeck" --version
