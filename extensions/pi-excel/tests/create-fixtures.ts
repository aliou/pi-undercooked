/**
 * Script to generate test fixture files (.xls and .xlsx).
 * Run with: npx tsx tests/create-fixtures.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import XLSX from "@e965/xlsx";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

function write(wb: XLSX.WorkBook, name: string, bookType: XLSX.BookType) {
  const buf = XLSX.write(wb, { type: "buffer", bookType });
  fs.writeFileSync(path.join(FIXTURES_DIR, name), buf);
  console.log(`  Created ${name}`);
}

// 1. Simple single-sheet workbook with mixed types.
function createSimple() {
  const data = [
    ["Name", "Age", "City", "Active"],
    ["Alice", 30, "Paris", true],
    ["Bob", 25, "London", false],
    ["Charlie", 35, "Berlin", true],
    ["Diana", 28, "Tokyo", true],
    ["Eve", 22, "New York", false],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "People");

  write(wb, "simple.xlsx", "xlsx");
  write(wb, "simple.xls", "xls");
}

// 2. Multi-sheet workbook.
function createMultiSheet() {
  const wb = XLSX.utils.book_new();

  const products = [
    ["Product", "Price", "Category"],
    ["Widget", 9.99, "Hardware"],
    ["Gadget", 24.99, "Electronics"],
    ["Doohickey", 4.5, "Hardware"],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(products),
    "Products",
  );

  const orders = [
    ["OrderID", "Product", "Quantity", "Total"],
    [1001, "Widget", 5, 49.95],
    [1002, "Gadget", 2, 49.98],
    [1003, "Widget", 10, 99.9],
    [1004, "Doohickey", 3, 13.5],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orders), "Orders");

  write(wb, "multi-sheet.xlsx", "xlsx");
  write(wb, "multi-sheet.xls", "xls");
}

// 3. Workbook with empty cells / sparse data.
function createSparse() {
  const data = [
    ["Name", "Email", "Phone", "Notes"],
    ["Alice", "alice@example.com", null, "VIP"],
    ["Bob", null, "+1234567890", null],
    ["Charlie", "charlie@example.com", null, null],
    [null, null, null, null],
    ["Eve", "eve@example.com", "+0987654321", "New customer"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contacts");

  write(wb, "sparse.xlsx", "xlsx");
}

// 4. Headers-only workbook (no data rows).
function createHeadersOnly() {
  const data = [["ID", "Title", "Status", "Priority"]];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");

  write(wb, "headers-only.xlsx", "xlsx");
}

console.log("Creating test fixtures...");
createSimple();
createMultiSheet();
createSparse();
createHeadersOnly();
console.log("Done!");
