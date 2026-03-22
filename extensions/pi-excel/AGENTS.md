# pi-excel

Pi extension providing tools for reading, writing, and managing Excel files (.xls and .xlsx). Uses `@e965/xlsx` (SheetJS fork) as the single dependency for all Excel operations.

## Stack

- TypeScript (strict mode)
- `@e965/xlsx` for Excel I/O (both .xls and .xlsx)
- Vitest for testing
- Pi extension SDK (`@mariozechner/pi-coding-agent` >= 0.52.9)

## Scripts

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run test:watch  # vitest (watch mode)
```

## Structure

```
src/
  index.ts              # Extension entry point, registers all tools
  utils/
    excel.ts            # Core Excel operations (read, write, describe, etc.)
  tools/
    index.ts            # Re-exports all tool execute fns and register fns
    describe.ts         # excel_describe tool
    read.ts             # excel_read tool
    write.ts            # excel_write tool
    add-rows.ts         # excel_add_rows tool
    create.ts           # excel_create tool
tests/
  fixtures/             # .xls and .xlsx test files (generated, committed)
  create-fixtures.ts    # Script to regenerate fixture files (npx tsx tests/create-fixtures.ts)
  describe.test.ts
  read.test.ts
  write.test.ts
  add-rows.test.ts
  create.test.ts
```

## Architecture

Each tool has two exports:
- `executeX(params)` -- standalone function with no pi dependency. This is the core logic, testable and reusable outside the extension (exported via `@aliou/pi-excel/tools`).
- `registerXTool(pi)` -- wraps `executeX` in the pi tool registration (parameters schema, renderCall, renderResult).

The `src/utils/excel.ts` file contains the low-level Excel operations. Tool execute functions in `src/tools/` compose these utilities and format the output for the pi tool protocol (`{ content, details }`).

## Conventions

### Adding a new tool

1. Create `src/tools/<name>.ts` with both `executeX` and `registerXTool` exports.
2. Add exports to `src/tools/index.ts`.
3. Call `registerXTool(pi)` in `src/index.ts`.
4. Add tests in `tests/<name>.test.ts`.
5. If new fixture files are needed, add generation logic to `tests/create-fixtures.ts` and run it.

### Tool execute signature

Execute functions take a plain params object and return `{ content: [{ type: "text", text: string }], details: Record<string, unknown> }`. The `content` array is what the LLM sees. The `details` object is used by `renderResult` for the TUI display.

### Tool registration

Follow the pi extension SDK rules:
- Execute param order: `(toolCallId, params, signal, onUpdate, ctx)` -- signal before onUpdate.
- `renderCall` and `renderResult` must return `new Text(str, 0, 0)` from `@mariozechner/pi-tui`, not plain strings.
- Use `Type` from `@sinclair/typebox` for parameter schemas, not from pi-coding-agent.
- `truncateHead` from pi-coding-agent returns a `TruncationResult` object. Use `.content` for the string.

### Excel operations

All Excel I/O goes through `@e965/xlsx`. The `readWorkbook` / `writeWorkbook` helpers in `utils/excel.ts` handle both .xls and .xlsx transparently. Row numbers in tool params are 1-indexed data rows (header row is implicit, not counted).

### Tests

Tests call `executeX` functions directly (no pi mocking needed). Write operations use temp files created in `beforeEach` and cleaned in `afterEach`. Read-only tests use committed fixtures from `tests/fixtures/`.

To regenerate fixtures: `npx tsx tests/create-fixtures.ts`.
