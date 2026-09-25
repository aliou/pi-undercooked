#!/usr/bin/env bash
#
# Build native tools for pi-playdate.
# Builds the playdate-simctl Swift helper and playdate-sim-agent dylib.
#
# This script must be run outside the nix shell to access system compilers.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "Native tools are only built on macOS (skipping)"
    exit 0
fi

if ! command -v swiftc &> /dev/null; then
    echo "Warning: swiftc not found, skipping native tool build"
    exit 0
fi

if ! command -v clang &> /dev/null; then
    echo "Warning: clang not found, skipping native tool build"
    exit 0
fi

TOOLS_DIR="native"
OUTPUT_DIR="bin"

mkdir -p "$OUTPUT_DIR"

SIMCTL_SOURCE="$TOOLS_DIR/playdate-simctl.swift"
SIMCTL_OUTPUT="$OUTPUT_DIR/playdate-simctl"
AGENT_SOURCE="$TOOLS_DIR/playdate-sim-agent.c"
AGENT_OUTPUT="$OUTPUT_DIR/playdate-sim-agent.dylib"

if [[ ! -f "$SIMCTL_OUTPUT" || "$SIMCTL_SOURCE" -nt "$SIMCTL_OUTPUT" ]]; then
    echo "Building playdate-simctl..."

    env -i \
        HOME="$HOME" \
        PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
        /usr/bin/swiftc -O "$SIMCTL_SOURCE" -o "$SIMCTL_OUTPUT"

    echo "Built: $SIMCTL_OUTPUT"
else
    echo "playdate-simctl is up to date"
fi

if [[ ! -f "$AGENT_OUTPUT" || "$AGENT_SOURCE" -nt "$AGENT_OUTPUT" ]]; then
    echo "Building playdate-sim-agent.dylib..."

    env -i \
        HOME="$HOME" \
        PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
        /usr/bin/clang -O2 -fobjc-arc -dynamiclib -fblocks "$AGENT_SOURCE" -o "$AGENT_OUTPUT"

    echo "Built: $AGENT_OUTPUT"
else
    echo "playdate-sim-agent.dylib is up to date"
fi

echo "Native tools build complete"
