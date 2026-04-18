/**
 * slam_variants_list — paginated variants, optionally filtered by product_id.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const SORT_COLUMNS = ["title", "sku", "price", "inventory_quantity", "position"] as const;

const schema = {
  product_id: z.string().optional().describe("Filter by product ID (Shopify GID)"),
  data_quality: z.enum(["no_sku", "no_barcode"]).optional()
    .describe("Filter to variants with a specific data quality gap: 'no_sku' (empty or null SKU), 'no_barcode' (empty or null barcode)"),
  limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return (1-100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
  sort_by: z.enum(SORT_COLUMNS).default("title").describe("Column to sort by"),
  sort_order: z.enum(["ASC", "DESC"]).default("ASC").describe("Sort direction"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const variantsList: ToolDef = {
  name: "slam_variants_list",
  description:
    "Returns a paginated list of variants. Optionally filter by product_id to see variants for a specific product.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.product_id) {
      where.push("v.product_id = ?");
      filterBindings.push(params.product_id);
    }
    if (params.data_quality === "no_sku") {
      where.push("(v.sku IS NULL OR v.sku = '')");
    }
    if (params.data_quality === "no_barcode") {
      where.push("(v.barcode IS NULL OR v.barcode = '')");
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    // Allowlisted sort columns — safe from injection
    const sortCol = SORT_COLUMNS.includes(params.sort_by) ? params.sort_by : "title";
    const sortDir = params.sort_order === "DESC" ? "DESC" : "ASC";

    // Map of column names that need CAST for correct numeric ordering
    const SORT_EXPR: Record<string, string> = {
      price: "CAST(v.price AS REAL)",
    };
    const sortExpr = SORT_EXPR[sortCol] ?? `v.${sortCol}`;

    const sql = `
      SELECT
        v.id, v.product_id, v.title, v.sku, v.price, v.compare_at_price,
        v.inventory_quantity, v.barcode, v.weight, v.position,
        p.title AS product_title
      FROM variants v
      JOIN products p ON p.id = v.product_id
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDir}
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    // Count total for has_more
    const countSql = `SELECT COUNT(*) AS cnt FROM variants v ${whereClause}`;
    const countRow = db.prepare(countSql).get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "variants",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
      },
      variants: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
