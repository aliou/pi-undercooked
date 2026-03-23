# pi-osc-progress

Pi extension that shows a terminal progress bar via iTerm2's OSC 9;4 protocol. Displays an indeterminate spinner while the agent is working, flashes error state on tool failures, and clears on completion.

Compatible with iTerm2, Ghostty, and other terminals that support OSC 9. Terminals that don't understand it silently ignore the sequences. Handles TMUX and GNU Screen DCS passthrough automatically.

## Lifecycle

- `agent_start`: show indeterminate spinner (`op=3`), reset error state
- `tool_execution_end`: if `isError`, switch to error state (`op=2`)
- `agent_end`: clear (`op=0`), or brief error flash then clear if any tool failed
- `session_shutdown`: clear so the bar never gets stuck

## Test tool: `sleep_progress`

Registered as a custom tool the LLM can call. Sleeps for a given number of seconds while showing determinate progress (0-100%) in the terminal tab bar. Returns to indeterminate after completion since the agent turn is still active.

## OSC 9;4 protocol

```
ESC ] 9 ; 4 ; <op> ; <value> BEL
```

| op | meaning |
|----|---------|
| `0` | clear (hide progress bar) |
| `1` | set determinate progress (`value` = 0-100) |
| `2` | error state |
| `3` | indeterminate (animated spinner/pulse) |

### Multiplexer passthrough

- **TMUX** (`$TMUX` set): wraps in DCS passthrough with doubled ESC
- **GNU Screen** (`$STY` set): wraps in DCS passthrough

### Kitty caveat

Kitty uses `ESC \\` (ST) instead of `BEL` as the string terminator. This extension uses `BEL` which works with iTerm2 and Ghostty. Kitty support is not implemented.
