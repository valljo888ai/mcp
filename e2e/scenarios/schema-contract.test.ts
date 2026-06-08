import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { DB_PATH } from "../helpers.js";

function columnsFor(db: Database.Database, tableName: string): string[] {
  return (
    db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>
  ).map((column) => column.name);
}

describe("Gadget SQLite schema contract", () => {
  it("contains the tables and columns slam-mcp depends on", () => {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    try {
      const expectedColumns: Record<string, string[]> = {
        _slam_meta: ["schema_version"],
        sync_metadata: ["key", "value"],
        metafields: ["owner_type", "owner_id"],
        order_line_items: ["id"],
        collects: ["id"],
        inventory_levels: ["available"],
        selling_plan_group_product_variants: ["id"],
      };

      for (const [tableName, requiredColumns] of Object.entries(expectedColumns)) {
        const columns = columnsFor(db, tableName);
        expect(columns.length, `${tableName} should exist`).toBeGreaterThan(0);
        for (const column of requiredColumns) {
          expect(columns, `${tableName}.${column} should exist`).toContain(column);
        }
      }
    } finally {
      db.close();
    }
  });
});
