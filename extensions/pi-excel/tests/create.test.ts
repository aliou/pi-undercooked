import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCreate } from "../src/tools/create";
import { executeDescribe } from "../src/tools/describe";

function tmpFile(ext = ".xlsx"): string {
  return path.join(
    os.tmpdir(),
    `pi-excel-test-${crypto.randomBytes(6).toString("hex")}${ext}`,
  );
}

describe("excel_create", () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    tmpFiles.length = 0;
  });

  it("creates a single-sheet workbook", async () => {
    const file = tmpFile();
    tmpFiles.push(file);

    const result = await executeCreate({
      path: file,
      sheets: [{ name: "Data", columns: ["A", "B", "C"] }],
    });

    expect(result.details.sheets).toEqual(["Data"]);
    expect(fs.existsSync(file)).toBe(true);

    const desc = await executeDescribe({ path: file });
    const wb = desc.details.workbook;
    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0].name).toBe("Data");
    expect(wb.sheets[0].rowCount).toBe(0);
    expect(wb.sheets[0].columns.map((c) => c.name)).toEqual(["A", "B", "C"]);
  });

  it("creates a multi-sheet workbook", async () => {
    const file = tmpFile();
    tmpFiles.push(file);

    const result = await executeCreate({
      path: file,
      sheets: [
        { name: "Users", columns: ["Name", "Email"] },
        { name: "Roles", columns: ["Role", "Level"] },
      ],
    });

    expect(result.details.sheets).toEqual(["Users", "Roles"]);

    const desc = await executeDescribe({ path: file });
    expect(desc.details.workbook.sheets).toHaveLength(2);
  });

  it("throws if file already exists", async () => {
    const file = tmpFile();
    tmpFiles.push(file);

    await executeCreate({
      path: file,
      sheets: [{ name: "S1", columns: ["X"] }],
    });

    await expect(
      executeCreate({ path: file, sheets: [{ name: "S2", columns: ["Y"] }] }),
    ).rejects.toThrow("already exists");
  });

  it("creates parent directories", async () => {
    const dir = path.join(
      os.tmpdir(),
      `pi-excel-nested-${crypto.randomBytes(4).toString("hex")}`,
    );
    const file = path.join(dir, "sub", "file.xlsx");
    tmpFiles.push(file);

    await executeCreate({
      path: file,
      sheets: [{ name: "Sheet1", columns: ["Col1"] }],
    });

    expect(fs.existsSync(file)).toBe(true);

    // Cleanup nested dirs.
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
