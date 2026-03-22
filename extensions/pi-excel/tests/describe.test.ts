import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { executeDescribe } from "../src/tools/describe";

const fixtures = path.join(import.meta.dirname, "fixtures");

describe("excel_describe", () => {
  it("describes a simple xlsx workbook", async () => {
    const result = await executeDescribe({
      path: path.join(fixtures, "simple.xlsx"),
    });
    const wb = result.details.workbook;

    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0].name).toBe("People");
    expect(wb.sheets[0].rowCount).toBe(5);
    expect(wb.sheets[0].columnCount).toBe(4);

    const colNames = wb.sheets[0].columns.map((c) => c.name);
    expect(colNames).toEqual(["Name", "Age", "City", "Active"]);

    const colTypes = wb.sheets[0].columns.map((c) => c.type);
    expect(colTypes).toEqual(["string", "number", "string", "boolean"]);
  });

  it("describes a simple xls workbook", async () => {
    const result = await executeDescribe({
      path: path.join(fixtures, "simple.xls"),
    });
    const wb = result.details.workbook;

    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0].name).toBe("People");
    expect(wb.sheets[0].rowCount).toBe(5);
  });

  it("describes a multi-sheet workbook", async () => {
    const result = await executeDescribe({
      path: path.join(fixtures, "multi-sheet.xlsx"),
    });
    const wb = result.details.workbook;

    expect(wb.sheets).toHaveLength(2);
    expect(wb.sheets[0].name).toBe("Products");
    expect(wb.sheets[0].rowCount).toBe(3);
    expect(wb.sheets[1].name).toBe("Orders");
    expect(wb.sheets[1].rowCount).toBe(4);
  });

  it("describes a headers-only workbook", async () => {
    const result = await executeDescribe({
      path: path.join(fixtures, "headers-only.xlsx"),
    });
    const wb = result.details.workbook;

    expect(wb.sheets[0].rowCount).toBe(0);
    expect(wb.sheets[0].columnCount).toBe(4);
    const colNames = wb.sheets[0].columns.map((c) => c.name);
    expect(colNames).toEqual(["ID", "Title", "Status", "Priority"]);
  });

  it("throws for non-existent file", async () => {
    await expect(
      executeDescribe({ path: "/nonexistent/file.xlsx" }),
    ).rejects.toThrow("File not found");
  });

  it("returns text content with sheet info", async () => {
    const result = await executeDescribe({
      path: path.join(fixtures, "simple.xlsx"),
    });
    expect(result.content[0].text).toContain("People");
    expect(result.content[0].text).toContain("Name");
  });
});
