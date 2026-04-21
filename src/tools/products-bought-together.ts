/**
 * slam_products_bought_together — co-purchase frequency analysis.
 *
 * Answers: "What products do customers buy together? What are the best
 * bundle opportunities?" Uses an order_line_items self-join to find product pairs
 * that appear in the same order.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  product_id: z
    .string()
    .optional()
    .describe(
      "Anchor product ID — find everything this product is bought with. " +
        "Omit to see top pairs across all products.",
    ),
  min_co_orders: z
    .number()
    .int()
    .min(1)
    .default(2)
    .describe(
      "Minimum number of orders in which both products must appear together (default 2)",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Max pairs to return (1-50, default 20)"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const productsBoughtTogether: ToolDef = {
  name: "slam_products_bought_together",
  description:
    "Returns product pairs ranked by co-purchase frequency — how often two " +
    "products appear together in the same order. Use to discover bundle " +
    "opportunities. Supply product_id to anchor on a specific product, or omit " +
    "to see the top pairs across all orders.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const anchorCondition = params.product_id
      ? "AND li1.product_id = ?"
      : "";

    const pairDedup = params.product_id
      ? "AND li1.product_id != li2.product_id"
      : "AND li1.product_id < li2.product_id";

    const sql = `
      SELECT
        li1.product_id                                   AS product_a_id,
        p1.title                                         AS product_a_title,
        li2.product_id                                   AS product_b_id,
        p2.title                                         AS product_b_title,
        COUNT(DISTINCT li1.order_id)                     AS co_purchase_count
      FROM order_line_items li1
      JOIN order_line_items li2
        ON li1.order_id = li2.order_id
        ${pairDedup}
      JOIN products p1 ON p1.id = li1.product_id
      JOIN products p2 ON p2.id = li2.product_id
      WHERE li1.product_id IS NOT NULL
        AND li2.product_id IS NOT NULL
        ${anchorCondition}
      GROUP BY li1.product_id, li2.product_id
      HAVING COUNT(DISTINCT li1.order_id) >= ?
      ORDER BY co_purchase_count DESC
      LIMIT ?
    `;

    const bindValues: unknown[] = [];
    if (params.product_id) {
      bindValues.push(params.product_id);
    }
    bindValues.push(params.min_co_orders);
    bindValues.push(params.limit);

    const rows = db
      .prepare(sql)
      .all(...bindValues) as Record<string, unknown>[];

    const meta: Record<string, unknown> = {
      domain: "products",
      output_type: "list",
      last_sync_at: freshness.last_sync_at,
      minutes_since_sync: freshness.minutes_since_sync,
      freshness_tier: freshness.freshness_tier,
      returned: rows.length,
      total_count: rows.length,
      has_more: false,
      offset: 0,
      min_co_orders: params.min_co_orders,
    };

    if (!params.product_id) {
      meta["note"] =
        "Showing top product pairs by co-purchase frequency across all orders.";
    }

    const result = {
      _meta: meta,
      product_pairs: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
