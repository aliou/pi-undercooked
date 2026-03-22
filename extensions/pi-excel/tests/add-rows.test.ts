import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeAddRows } from "../src/tools/add-rows";
import { executeCreate } from "../src/tools/create";
import { executeRead } from "../src/tools/read";

function tmpFile(ext = ".xlsx"): string {
  return path.join(
    os.tmpdir(),
    `pi-excel-test-${crypto.randomBytes(6).toString("hex")}${ext}`,
  );
}

describe("excel_add_rows", () => {
  let testFile: string;

  beforeEach(async () => {
    testFile = tmpFile();
    await executeCreate({
      path: testFile,
      sheets: [{ name: "Items", columns: ["ID", "Name", "Price"] }],
    });
  });

  afterEach(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  it("appends rows to an empty sheet", async () => {
    const result = await executeAddRows({
      path: testFile,
      rows: [
        { ID: 1, Name: "Widget", Price: 9.99 },
        { ID: 2, Name: "Gadget", Price: 24.99 },
      ],
    });

    expect(result.details.addedRows).toBe(2);
    expect(result.details.newRowCount).toBe(2);

    const read = await executeRead({ path: testFile });
    const rows = JSON.parse(read.content[0].text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ ID: 1, Name: "Widget", Price: 9.99 });
  });

  it("appends rows to a sheet that already has data", async () => {
    await executeAddRows({
      path: testFile,
      rows: [{ ID: 1, Name: "Widget", Price: 9.99 }],
    });

    const result = await executeAddRows({
      path: testFile,
      rows: [
        { ID: 2, Name: "Gadget", Price: 24.99 },
        { ID: 3, Name: "Doohickey", Price: 4.5 },
      ],
    });

    expect(result.details.addedRows).toBe(2);
    expect(result.details.newRowCount).toBe(3);

    const read = await executeRead({ path: testFile });
    const rows = JSON.parse(read.content[0].text);
    expect(rows).toHaveLength(3);
    expect(rows[2].Name).toBe("Doohickey");
  });

  it("appends to a specific sheet in a multi-sheet workbook", async () => {
    // Recreate with two sheets.
    fs.unlinkSync(testFile);
    await executeCreate({
      path: testFile,
      sheets: [
        { name: "Items", columns: ["ID", "Name"] },
        { name: "Log", columns: ["Timestamp", "Event"] },
      ],
    });

    await executeAddRows({
      path: testFile,
      sheet: "Log",
      rows: [{ Timestamp: "2024-01-01", Event: "start" }],
    });

    const read = await executeRead({ path: testFile, sheet: "Log" });
    const rows = JSON.parse(read.content[0].text);
    expect(rows).toHaveLength(1);
    expect(rows[0].Event).toBe("start");
  });

  it("ignores unknown column keys", async () => {
    const result = await executeAddRows({
      path: testFile,
      rows: [{ ID: 1, Name: "Widget", Price: 9.99, UnknownCol: "ignored" }],
    });

    expect(result.details.addedRows).toBe(1);

    const read = await executeRead({ path: testFile });
    const rows = JSON.parse(read.content[0].text);
    expect(Object.keys(rows[0])).toEqual(["ID", "Name", "Price"]);
  });
});
