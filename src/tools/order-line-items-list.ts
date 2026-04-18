/**
 * slam_order_line_items_list — list individual order line items.
 *
 * Gadget schema: table is order_line_items (not line_items).
 * Additional columns: variant_title, vendor.
 *
 * Filterable by product, variant, or order. Useful for cross-order product
 * queries: "show all orders containing variant X", "which orders had this product?"
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  product_id: z
    .string()
    .optional()
    .describe("Filter to line items for this product ID"),
  variant_id: z
    .string()
    .optional()
    .describe("Filter to line items for this variant ID"),
  order_id: z
    .string()
    .optional()
    .describe("Filter to line items from this order ID"),
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

export const orderLineItemsList: ToolDef = {
  name: "slam_order_line_items_list",
  description:
    "List individual order line items. Filter by product, variant, or specific order. Useful for cross-order product queries like 'show all orders containing variant X' or 'which orders had this product?'",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.product_id) {
      where.push("li.product_id = ?");
      filterBindings.push(params.product_id);
    }
    if (params.variant_id) {
      where.push("li.variant_id = ?");
      filterBindings.push(params.variant_id);
    }
    if (params.order_id) {
      where.push("li.order_id = ?");
      filterBindings.push(params.order_id);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        li.id, li.order_id, li.product_id, li.variant_id,
        li.title, li.variant_title, li.vendor,
        li.sku, li.quantity, li.price,
        o.name AS order_name, o.created_at AS order_date,
        o.financial_status, o.fulfillment_status
      FROM order_line_items li
      JOIN orders o ON o.id = li.order_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM order_line_items li
      JOIN orders o ON o.id = li.order_id
      ${whereClause}
    `;
    const countRow = db.prepare(countSql).get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "orders",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
      },
      line_items: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
