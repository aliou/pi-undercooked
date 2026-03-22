import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeAddRows } from "../src/tools/add-rows";
import { executeCreate } from "../src/tools/create";
import { executeRead } from "../src/tools/read";
import { executeWrite } from "../src/tools/write";

function tmpFile(ext = ".xlsx"): string {
  return path.join(
    os.tmpdir(),
    `pi-excel-test-${crypto.randomBytes(6).toString("hex")}${ext}`,
  );
}

describe("excel_write", () => {
  let testFile: string;

  beforeEach(async () => {
    testFile = tmpFile();
    await executeCreate({
      path: testFile,
      sheets: [{ name: "Data", columns: ["Name", "Score", "Grade"] }],
    });
    await executeAddRows({
      path: testFile,
      sheet: "Data",
      rows: [
        { Name: "Alice", Score: 85, Grade: "B" },
        { Name: "Bob", Score: 92, Grade: "A" },
        { Name: "Charlie", Score: 78, Grade: "C" },
      ],
    });
  });

  afterEach(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  it("updates a single cell", async () => {
    const result = await executeWrite({
      path: testFile,
      operations: [{ row: 1, column: "Grade", value: "A+" }],
    });

    expect(result.details.updatedCells).toBe(1);

    const read = await executeRead({ path: testFile });
    const rows = JSON.parse(read.content[0].text);
    expect(rows[0].Grade).toBe("A+");
    // Other cells unchanged.
    expect(rows[0].Name).toBe("Alice");
    expect(rows[0].Score).toBe(85);
  });

  it("updates multiple cells", async () => {
    const result = await executeWrite({
      path: testFile,
      operations: [
        { row: 1, column: "Score", value: 95 },
        { row: 2, column: "Score", value: 88 },
        { row: 3, column: "Grade", value: "B" },
      ],
    });

    expect(result.details.updatedCells).toBe(3);

    const read = await executeRead({ path: testFile });
    const rows = JSON.parse(read.content[0].text);
    expect(rows[0].Score).toBe(95);
    expect(rows[1].Score).toBe(88);
    expect(rows[2].Grade).toBe("B");
  });

  it("throws for non-existent column", async () => {
    await expect(
      executeWrite({
        path: testFile,
        operations: [{ row: 1, column: "NonExistent", value: "x" }],
      }),
    ).rejects.toThrow("not found");
  });

  it("throws for non-existent file", async () => {
    await expect(
      executeWrite({
        path: "/nonexistent/file.xlsx",
        operations: [{ row: 1, column: "Name", value: "x" }],
      }),
    ).rejects.toThrow("not found");
  });
});
