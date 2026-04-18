/**
 * slam_dead_stock — variants with available inventory but no sales.
 *
 * Answers "what stock is sitting unsold?" — useful for clearance decisions.
 * Joins variant_stock_health (multi-location stock) with product_sales (orders).
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  min_available: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      "Only return variants with at least this much available stock (default 1)",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Max rows to return (1–100, default 50)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const deadStock: ToolDef = {
  name: "slam_dead_stock",
  description:
    "Returns variants that have available inventory but no recorded sales (order_count = 0). Useful for identifying stock to clearance or discontinue. Sorted by highest stock first.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const sql = `
      SELECT
        vsh.variant_id, vsh.product_id, vsh.variant_title, vsh.sku,
        vsh.total_available, vsh.total_on_hand,
        p.title AS product_title, p.vendor, p.product_type, p.status
      FROM variant_stock_health vsh
      JOIN products p ON p.id = vsh.product_id
      LEFT JOIN product_sales ps ON ps.product_id = vsh.product_id
      WHERE vsh.total_available >= ?
        AND COALESCE(ps.order_count, 0) = 0
      ORDER BY vsh.total_available DESC, p.title ASC
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(sql)
      .all(params.min_available, params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM variant_stock_health vsh
         LEFT JOIN product_sales ps ON ps.product_id = vsh.product_id
         WHERE vsh.total_available >= ?
           AND COALESCE(ps.order_count, 0) = 0`,
      )
      .get(params.min_available) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "inventory",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
        min_available: params.min_available,
        note: "Only variants with zero order_count in product_sales. Products with any historical orders do not appear.",
      },
      variants: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
