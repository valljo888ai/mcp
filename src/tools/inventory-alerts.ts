/**
 * slam_inventory_alerts — variants at or below a stock threshold.
 *
 * Answers "what do I need to reorder?" in a single call.
 * Uses the variant_stock_health TEMP view which aggregates inventory_levels
 * across all locations, so values are multi-location accurate.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  threshold: z
    .number()
    .int()
    .min(0)
    .default(5)
    .describe(
      "Return variants where total_available <= this value (default 5). Use 0 for out-of-stock only.",
    ),
  include_zero_only: z
    .boolean()
    .default(false)
    .describe(
      "If true, only return variants with total_available = 0 (overrides threshold)",
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

export const inventoryAlerts: ToolDef = {
  name: "slam_inventory_alerts",
  description:
    "Returns variants at or below a stock threshold — your reorder list. Uses multi-location inventory_levels aggregation via the variant_stock_health view. Sorted by lowest stock first.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const stockFilter = params.include_zero_only
      ? "vsh.total_available = 0"
      : "vsh.total_available <= ?";
    const filterBindings: unknown[] = params.include_zero_only
      ? []
      : [params.threshold];

    const sql = `
      SELECT
        vsh.variant_id, vsh.product_id, vsh.variant_title, vsh.sku,
        vsh.total_available, vsh.total_on_hand, vsh.total_reserved,
        p.title AS product_title, p.vendor
      FROM variant_stock_health vsh
      JOIN products p ON p.id = vsh.product_id
      WHERE ${stockFilter}
      ORDER BY vsh.total_available ASC, p.title ASC
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(sql)
      .all(...filterBindings, params.limit, params.offset) as Record<
      string,
      unknown
    >[];

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM variant_stock_health vsh
      WHERE ${stockFilter}
    `;
    const countRow = db
      .prepare(countSql)
      .get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const effectiveThreshold = params.include_zero_only ? 0 : params.threshold;

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
        threshold: effectiveThreshold,
        include_zero_only: params.include_zero_only,
      },
      alerts: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
