import * as fs from "node:fs";
import * as path from "node:path";
import XLSX from "@e965/xlsx";

export interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
  columns: { name: string; type: string }[];
}

export interface WorkbookInfo {
  path: string;
  sheets: SheetInfo[];
}

function readWorkbook(filePath: string): XLSX.WorkBook {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const buf = fs.readFileSync(resolved);
  return XLSX.read(buf, { cellDates: true });
}

function writeWorkbook(wb: XLSX.WorkBook, filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  const bookType: XLSX.BookType = ext === ".xls" ? "xls" : "xlsx";
  const buf = XLSX.write(wb, { type: "buffer", bookType });
  fs.writeFileSync(filePath, buf);
}

function getSheet(
  wb: XLSX.WorkBook,
  name?: string,
): { sheet: XLSX.WorkSheet; sheetName: string } {
  const sheetName = name ?? wb.SheetNames[0];
  if (!sheetName || !wb.SheetNames.includes(sheetName)) {
    throw new Error(
      `Sheet "${name}" not found. Available: ${wb.SheetNames.join(", ")}`,
    );
  }
  return { sheet: wb.Sheets[sheetName], sheetName };
}

/** Parse sheet as array-of-arrays (header: 1) to get raw grid. */
function sheetToGrid(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

function inferColumnType(grid: unknown[][], colIndex: number): string {
  const sampleSize = Math.min(20, grid.length - 1);
  const types = new Set<string>();

  for (let row = 1; row <= sampleSize; row++) {
    const value = grid[row]?.[colIndex];
    if (value === null || value === undefined || value === "") continue;

    if (value instanceof Date) {
      types.add("date");
    } else if (typeof value === "number") {
      types.add("number");
    } else if (typeof value === "boolean") {
      types.add("boolean");
    } else {
      types.add("string");
    }
  }

  if (types.size === 0) return "unknown";
  if (types.size === 1) return [...types][0];
  return [...types].join(" | ");
}

export async function describeWorkbook(
  filePath: string,
): Promise<WorkbookInfo> {
  const resolved = path.resolve(filePath);
  const wb = readWorkbook(filePath);

  const sheets: SheetInfo[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const grid = sheetToGrid(sheet);
    const headers = (grid[0] ?? []) as unknown[];
    const dataRows = Math.max(0, grid.length - 1);

    const columns: { name: string; type: string }[] = [];
    for (let col = 0; col < headers.length; col++) {
      columns.push({
        name: String(headers[col] ?? `Column ${col + 1}`),
        type: inferColumnType(grid, col),
      });
    }

    sheets.push({
      name,
      rowCount: dataRows,
      columnCount: headers.length,
      columns,
    });
  }

  return { path: resolved, sheets };
}

export interface ReadOptions {
  sheet?: string;
  startRow?: number;
  endRow?: number;
  columns?: string[];
}

export async function readSheet(
  filePath: string,
  options: ReadOptions = {},
): Promise<{
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}> {
  const wb = readWorkbook(filePath);
  const { sheet } = getSheet(wb, options.sheet);
  const grid = sheetToGrid(sheet);

  const allHeaders = ((grid[0] ?? []) as unknown[]).map((h, i) =>
    String(h ?? `Column ${i + 1}`),
  );

  const filteredColumns = options.columns
    ? new Set(options.columns.map((c) => c.toLowerCase()))
    : null;

  const headers = filteredColumns
    ? allHeaders.filter((h) => filteredColumns.has(h.toLowerCase()))
    : allHeaders;

  const totalRows = Math.max(0, grid.length - 1);
  const startRow = options.startRow ?? 1;
  const endRow = options.endRow ?? totalRows;

  const rows: Record<string, unknown>[] = [];

  for (let i = startRow; i <= endRow && i < grid.length; i++) {
    const gridRow = grid[i] ?? [];
    const record: Record<string, unknown> = {};

    for (let col = 0; col < allHeaders.length; col++) {
      const name = allHeaders[col];
      if (filteredColumns && !filteredColumns.has(name.toLowerCase())) continue;
      record[name] = (gridRow as unknown[])[col] ?? null;
    }

    rows.push(record);
  }

  return { headers, rows, totalRows };
}

export interface WriteOperation {
  row: number;
  column: string;
  value: unknown;
}

export async function writeToSheet(
  filePath: string,
  sheet: string | undefined,
  operations: WriteOperation[],
): Promise<{ updatedCells: number }> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `File not found: ${resolved}. Use excel_create to create a new workbook.`,
    );
  }

  const wb = readWorkbook(filePath);
  const { sheet: ws } = getSheet(wb, sheet);

  // Build header map from first row.
  const grid = sheetToGrid(ws);
  const headers = ((grid[0] ?? []) as unknown[]).map((h, i) =>
    String(h ?? `Column ${i + 1}`),
  );
  const nameToCol: Map<string, number> = new Map();
  for (let i = 0; i < headers.length; i++) {
    nameToCol.set(headers[i].toLowerCase(), i);
  }

  let updatedCells = 0;

  for (const op of operations) {
    const colIdx = nameToCol.get(op.column.toLowerCase());
    if (colIdx === undefined) {
      throw new Error(
        `Column "${op.column}" not found. Available: ${headers.join(", ")}`,
      );
    }

    // op.row is 1-indexed data row; grid row 0 is header, so grid index = op.row.
    const cellRef = XLSX.utils.encode_cell({ r: op.row, c: colIdx });
    ws[cellRef] = { t: cellType(op.value), v: op.value };
    updatedCells++;
  }

  writeWorkbook(wb, resolved);
  return { updatedCells };
}

function cellType(value: unknown): string {
  if (typeof value === "number") return "n";
  if (typeof value === "boolean") return "b";
  if (value instanceof Date) return "d";
  if (value === null || value === undefined) return "z";
  return "s";
}

export interface AddRowsOptions {
  sheet?: string;
  rows: Record<string, unknown>[];
}

export async function addRows(
  filePath: string,
  options: AddRowsOptions,
): Promise<{ addedRows: number; newRowCount: number }> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `File not found: ${resolved}. Use excel_create to create a new workbook.`,
    );
  }

  const wb = readWorkbook(filePath);
  const { sheet: ws } = getSheet(wb, options.sheet);

  const grid = sheetToGrid(ws);
  const headers = ((grid[0] ?? []) as unknown[]).map((h, i) =>
    String(h ?? `Column ${i + 1}`),
  );
  const nameToCol: Map<string, number> = new Map();
  for (let i = 0; i < headers.length; i++) {
    nameToCol.set(headers[i].toLowerCase(), i);
  }

  let nextRow = grid.length; // Next row index (0-based, after existing data).

  for (const rowData of options.rows) {
    for (const [key, value] of Object.entries(rowData)) {
      const colIdx = nameToCol.get(key.toLowerCase());
      if (colIdx === undefined) continue;

      const cellRef = XLSX.utils.encode_cell({ r: nextRow, c: colIdx });
      ws[cellRef] = { t: cellType(value), v: value };
    }
    nextRow++;
  }

  // Update the sheet range.
  const lastCol = Math.max(0, headers.length - 1);
  ws["!ref"] = XLSX.utils.encode_range(
    { r: 0, c: 0 },
    { r: nextRow - 1, c: lastCol },
  );

  writeWorkbook(wb, resolved);

  return {
    addedRows: options.rows.length,
    newRowCount: nextRow - 1, // Exclude header.
  };
}

export interface CreateWorkbookOptions {
  sheets: { name: string; columns: string[] }[];
}

export async function createWorkbook(
  filePath: string,
  options: CreateWorkbookOptions,
): Promise<{ path: string; sheets: string[] }> {
  const resolved = path.resolve(filePath);

  if (fs.existsSync(resolved)) {
    throw new Error(`File already exists: ${resolved}`);
  }

  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const wb = XLSX.utils.book_new();

  for (const sheetDef of options.sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheetDef.columns]);
    XLSX.utils.book_append_sheet(wb, ws, sheetDef.name);
  }

  writeWorkbook(wb, resolved);

  return {
    path: resolved,
    sheets: options.sheets.map((s) => s.name),
  };
}
