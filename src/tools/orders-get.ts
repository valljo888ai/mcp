/**
 * slam_orders_get — single order with line items, discounts, and customer info.
 *
 * Gadget schema changes from V3:
 *   - line_items      → order_line_items
 *   - discount_applications → order_discount_codes (columns: code, amount, type)
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  id: z.string().describe("The order ID (Shopify GID)"),
} as const;
type Params = z.infer<z.ZodObject<typeof schema>>;

export const ordersGet: ToolDef = {
  name: "slam_orders_get",
  description:
    "Returns a single order by ID, including line items, discount codes, and customer info.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const order = db
      .prepare("SELECT * FROM orders WHERE id = ?")
      .get(params.id) as Record<string, unknown> | undefined;

    if (!order) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              _meta: {
                domain: "orders",
                output_type: "detail",
                last_sync_at: freshness.last_sync_at,
                minutes_since_sync: freshness.minutes_since_sync,
                freshness_tier: freshness.freshness_tier,
                returned: 0,
                offset: 0,
                has_more: false,
              },
              error: `Order not found: ${params.id}`,
            }, null, 2),
          },
        ],
      };
    }

    const lineItems = db
      .prepare("SELECT * FROM order_line_items WHERE order_id = ? ORDER BY id ASC")
      .all(params.id) as Record<string, unknown>[];

    const discountCodes = db
      .prepare("SELECT code, amount, type FROM order_discount_codes WHERE order_id = ?")
      .all(params.id) as Record<string, unknown>[];

    // Customer lookup via email
    let customer: Record<string, unknown> | null = null;
    const orderEmail = order["email"] as string | undefined;
    if (orderEmail) {
      customer = (db
        .prepare("SELECT * FROM customers WHERE email = ?")
        .get(orderEmail) as Record<string, unknown> | undefined) ?? null;
    }

    const result = {
      _meta: {
        domain: "orders",
        output_type: "detail",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      order: {
        ...order,
        line_items: lineItems,
        discount_codes: discountCodes,
        customer,
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
