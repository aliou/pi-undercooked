# pi-excel

Pi extension for reading, writing, and managing Excel files. Supports both `.xls` and `.xlsx` formats.

## Installation

```
pi install @aliou/pi-excel
```

## Tools

| Tool | Description |
|---|---|
| `excel_describe` | Inspect workbook structure: sheet names, row counts, column names and inferred types |
| `excel_read` | Read rows as JSON with optional row range and column filtering |
| `excel_write` | Update specific cells by row number and column name |
| `excel_add_rows` | Append rows to a sheet |
| `excel_create` | Create a new workbook with sheets and headers |

## Programmatic usage

The core execute functions are available for import outside the extension:

```ts
import { executeDescribe, executeRead } from "@aliou/pi-excel/tools";

const info = await executeDescribe({ path: "/path/to/file.xlsx" });
const data = await executeRead({ path: "/path/to/file.xlsx", sheet: "Sheet1" });
```

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run test:watch  # vitest (watch mode)
```
