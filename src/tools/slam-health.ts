import { statSync } from "node:fs";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { MCP_PROTOCOL_VERSION, MCP_SDK_MAJOR_VERSION, SLAM_MCP_VERSION } from "../constants.js";
import { wrapHandler, type ToolDef, ALL_TOOLS } from "./index.js";

export const slamHealth: ToolDef = {
  name: "slam_health",
  description:
    "Introspect the SLAM MCP server: MCP protocol version, server version, " +
    "SQLite version, database pathname, row counts per table, " +
    "table schema (column names per table), " +
    "last sync timestamp, and store metadata. Use as the first call to " +
    "verify the connection and detect version drift.",
  schema: {
    include_row_counts: z
      .boolean()
      .optional()
      .describe("Include per-table row counts. Defaults to true."),
    include_schema: z
      .boolean()
      .optional()
      .describe("Include column lists for every table. Defaults to true."),
  },
  handler: wrapHandler(async (params) => {
    const includeRows = (params?.["include_row_counts"] as boolean | undefined) ?? true;
    const includeSchema = (params?.["include_schema"] as boolean | undefined) ?? true;
    const { db, path: dbPath } = getDb();
    const freshness = getFreshness(db);

    let dbSizeBytes = 0;
    try { dbSizeBytes = statSync(dbPath).size; } catch { /* in-memory */ }

    const sqliteRow = db.prepare("SELECT sqlite_version() AS v").get() as { v: string } | undefined;

    // Gadget _slam_meta has named columns (not key/value)
    let metaRow: Record<string, string | null> = {};
    try {
      const row = db.prepare("SELECT * FROM _slam_meta LIMIT 1").get() as Record<string, string | null> | undefined;
      metaRow = row ?? {};
    } catch { /* non-SLAM db */ }

    let rowCounts: Record<string, number> | null = null;
    if (includeRows) {
      rowCounts = {};
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name"
      ).all() as { name: string }[];
      for (const { name } of tables) {
        try {
          const row = db.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get() as { c: number } | undefined;
          rowCounts[name] = row?.c ?? 0;
        } catch { /* skip */ }
      }
    }

    let tableSchema: Record<string, string[]> | null = null;
    if (includeSchema) {
      tableSchema = {};
      const allTables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name"
      ).all() as { name: string }[];
      for (const { name } of allTables) {
        try {
          const cols = db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[];
          tableSchema[name] = cols.map((c) => c.name);
        } catch { /* skip */ }
      }
    }

    const result = {
      _meta: {
        domain: "meta",
        output_type: "health",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      protocol_version: MCP_PROTOCOL_VERSION,
      server_version: SLAM_MCP_VERSION,
      sdk_major: MCP_SDK_MAJOR_VERSION,
      tool_count: ALL_TOOLS.length,
      sqlite_version: sqliteRow?.v ?? "unknown",
      database_path: dbPath,
      db_size_bytes: dbSizeBytes,
      last_sync_at: freshness.last_sync_at,
      minutes_since_sync: freshness.minutes_since_sync,
      freshness_tier: freshness.freshness_tier,
      schema_version: metaRow["schema_version"] ?? null,
      store_domain: metaRow["store_domain"] ?? metaRow["store_myshopify_domain"] ?? null,
      row_counts: rowCounts,
      table_schema: tableSchema,
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }),
};
