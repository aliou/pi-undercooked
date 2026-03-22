import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { executeRead } from "../src/tools/read";

const fixtures = path.join(import.meta.dirname, "fixtures");

describe("excel_read", () => {
  it("reads all rows from a simple xlsx", async () => {
    const result = await executeRead({
      path: path.join(fixtures, "simple.xlsx"),
    });
    const rows = JSON.parse(result.content[0].text);

    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      Name: "Alice",
      Age: 30,
      City: "Paris",
      Active: true,
    });
    expect(result.details.totalRows).toBe(5);
    expect(result.details.headers).toEqual(["Name", "Age", "City", "Active"]);
  });

  it("reads all rows from a simple xls", async () => {
    const result = await executeRead({
      path: path.join(fixtures, "simple.xls"),
    });
    const rows = JSON.parse(result.content[0].text);

    expect(rows).toHaveLength(5);
    expect(rows[0].Name).toBe("Alice");
    expect(rows[0].Age).toBe(30);
  });

  it("reads a specific sheet by name", async () => {
    const result = await executeRead({
      path: path.join(fixtures, "multi-sheet.xlsx"),
      sheet: "Orders",
    });
    const rows = JSON.parse(result.content[0].text);

    expect(rows).toHaveLength(4);
    expect(rows[0].OrderID).toBe(1001);
    expect(rows[0].Product).toBe("Widget");
  });

  it("reads a row range", async () => {
    const result = await executeRead({
      path: path.join(fixtures, "simple.xlsx"),
      start_row: 2,
      end_row: 4,
    });
    const rows = JSON.parse(result.content[0].text);

    expect(rows).toHaveLength(3);
    expect(rows[0].Name).toBe("Bob");
    expect(rows[2].Name).toBe("Diana");
  });

  it("filters columns", async () => {
    const result = await executeRead({
      path: path.join(fixtures, "simple.xlsx"),
      columns: ["Name", "City"],
    });
    const rows = JSON.parse(result.content[0].text);

    expect(rows).toHaveLength(5);
    expect(Object.keys(rows[0])).toEqual(["Name", "City"]);
    expect(rows[0]).toEqual({ Name: "Alice", City: "Paris" });
  });

  it("handles sparse data", async () => {
    const result = await executeRead({
      path: path.join(fixtures, "sparse.xlsx"),
    });
    const rows = JSON.parse(result.content[0].text);

    // Row with null email
    expect(rows[1].Name).toBe("Bob");
    expect(rows[1].Email).toBeNull();
    expect(rows[1].Phone).toBe("+1234567890");
  });

  it("reads headers-only workbook as empty", async () => {
    const result = await executeRead({
      path: path.join(fixtures, "headers-only.xlsx"),
    });
    const rows = JSON.parse(result.content[0].text);

    expect(rows).toHaveLength(0);
    expect(result.details.totalRows).toBe(0);
    expect(result.details.headers).toEqual([
      "ID",
      "Title",
      "Status",
      "Priority",
    ]);
  });

  it("throws for non-existent sheet", async () => {
    await expect(
      executeRead({
        path: path.join(fixtures, "simple.xlsx"),
        sheet: "NoSuchSheet",
      }),
    ).rejects.toThrow("not found");
  });
});
