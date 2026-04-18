/**
 * slam_prices_current — current variant prices with optional sale filter.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  product_id: z.string().optional().describe("Filter by product ID (Shopify GID)"),
  below_compare: z.boolean().optional().describe("If true, only show variants where price < compare_at_price (on sale)"),
  limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return (1-100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
} as const;
type Params = z.infer<z.ZodObject<typeof schema>>;

export const pricesCurrent: ToolDef = {
  name: "slam_prices_current",
  description:
    "Returns current variant prices. Use below_compare to show only variants where price < compare_at_price (on sale). Filterable by product_id.",
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
    if (params.below_compare) {
      where.push("v.compare_at_price IS NOT NULL AND CAST(v.price AS REAL) < CAST(v.compare_at_price AS REAL)");
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        v.id, v.product_id, v.title, v.sku,
        v.price, v.compare_at_price,
        p.title AS product_title
      FROM variants v
      JOIN products p ON p.id = v.product_id
      ${whereClause}
      ORDER BY CAST(v.price AS REAL) ASC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM variants v
      JOIN products p ON p.id = v.product_id
      ${whereClause}
    `;
    const countRow = db.prepare(countSql).get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "prices",
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
