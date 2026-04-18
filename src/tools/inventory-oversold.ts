/**
 * slam_inventory_oversold — variants where available stock is negative (oversold).
 *
 * Surfaces variants where total_available < 0, meaning orders have exceeded
 * inventory. Distinct from out-of-stock (zero) and from slam_inventory_alerts
 * (threshold-based). Sorted by most negative first.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Max rows to return (1-100, default 25)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of rows to skip"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const inventoryOversold: ToolDef = {
  name: "slam_inventory_oversold",
  description:
    "Returns variants where total available stock is negative — meaning orders have " +
    "exceeded inventory (overselling). Distinct from out-of-stock (zero stock). " +
    "Sorted by most negative first.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const sql = `
      SELECT
        vsh.variant_id,
        vsh.total_available,
        vsh.sku,
        vsh.variant_title,
        vsh.product_id,
        p.title AS product_title,
        p.status AS product_status,
        p.vendor
      FROM variant_stock_health vsh
      JOIN products p ON p.id = vsh.product_id
      WHERE vsh.total_available < 0
      ORDER BY vsh.total_available ASC
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(sql)
      .all(params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM variant_stock_health WHERE total_available < 0",
      )
      .get() as { cnt: number };
    const total = countRow.cnt;

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
      },
      oversold: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
