/**
 * slam_price_analysis — variants with discount/sale analysis.
 *
 * Wraps the price_comparison TEMP view. Answers "which products are on sale?"
 * and "what are my biggest discounts?" in a single call.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  on_sale_only: z
    .boolean()
    .default(true)
    .describe(
      "If true (default), only return variants where compare_at_price > price (items on sale)",
    ),
  min_discount_pct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe(
      "Only return variants with discount_percentage >= this value (e.g. 20 for 20%+ off)",
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

export const priceAnalysis: ToolDef = {
  name: "slam_price_analysis",
  description:
    "Returns variants with discount analysis from the price_comparison view. By default shows only items on sale (compare_at_price > price), sorted by biggest discount first.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.on_sale_only) {
      where.push(
        "compare_at_price IS NOT NULL AND CAST(compare_at_price AS REAL) > CAST(price AS REAL)",
      );
    }
    if (params.min_discount_pct !== undefined) {
      where.push("discount_percentage >= ?");
      filterBindings.push(params.min_discount_pct);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        variant_id, product_id, product_title, variant_title,
        price, compare_at_price, discount_percentage
      FROM price_comparison
      ${whereClause}
      ORDER BY discount_percentage DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(sql)
      .all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM price_comparison ${whereClause}`)
      .get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "pricing",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
        on_sale_only: params.on_sale_only,
        ...(params.min_discount_pct !== undefined
          ? { min_discount_pct: params.min_discount_pct }
          : {}),
      },
      variants: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
