#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXECUTABLE="${FLOWDECK_EXECUTABLE:-$ROOT_DIR/.flowdeck-cli/flowdeck}"

if [[ ! -x "$EXECUTABLE" ]]; then
  EXECUTABLE="flowdeck"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

(
  cd "$TMP_DIR"
  "$EXECUTABLE" ai install-skill --agent codex --mode project --json >/dev/null
)

SRC="$TMP_DIR/.codex/skills/flowdeck"
DST="$ROOT_DIR/skills/flowdeck"

if [[ ! -d "$SRC" ]]; then
  echo "FlowDeck skill install output not found at $SRC" >&2
  exit 1
fi

rm -rf "$DST"
mkdir -p "$ROOT_DIR/skills"
cp -R "$SRC" "$DST"

echo "Synced skills to $DST"
