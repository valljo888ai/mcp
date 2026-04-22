/**
 * slam_customers_get — single customer with recent orders and metafields.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  id: z.string().describe("The customer ID (Shopify GID)"),
} as const;
type Params = z.infer<z.ZodObject<typeof schema>>;

export const customersGet: ToolDef = {
  name: "slam_customers_get",
  description:
    "Returns a single customer by ID, including recent orders (up to 10) and metafields.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const customer = db
      .prepare("SELECT * FROM customers WHERE id = ?")
      .get(params.id) as Record<string, unknown> | undefined;

    // Enrich with live counts — synced columns (orders_count, total_spent) are not populated
    if (customer) {
      const liveCount = (db
        .prepare("SELECT COUNT(*) AS cnt FROM orders WHERE customer_id = ?")
        .get(params.id) as { cnt: number } | undefined)?.cnt ?? 0;
      customer["orders_count"] = liveCount;
      const rawSpent = customer["total_spent"];
      customer["total_spent"] =
        rawSpent !== null && rawSpent !== undefined
          ? parseFloat(String(rawSpent)) || 0
          : 0;
    }

    if (!customer) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              _meta: {
                domain: "customers",
                output_type: "detail",
                last_sync_at: freshness.last_sync_at,
                minutes_since_sync: freshness.minutes_since_sync,
                freshness_tier: freshness.freshness_tier,
                returned: 0,
                offset: 0,
                has_more: false,
              },
              error: `Customer not found: ${params.id}`,
            }, null, 2),
          },
        ],
      };
    }

    // Recent orders via email join (no customer_id FK in orders table)
    const customerEmail = customer["email"] as string | undefined;
    let recentOrders: Record<string, unknown>[] = [];
    if (customerEmail) {
      recentOrders = db
        .prepare(
          `SELECT id, name, total_price, financial_status, fulfillment_status, created_at
           FROM orders
           WHERE email = ?
           ORDER BY created_at DESC
           LIMIT 10`,
        )
        .all(customerEmail) as Record<string, unknown>[];
    }

    const metafields = db
      .prepare("SELECT * FROM metafields WHERE owner_id = ? AND owner_type = 'CUSTOMER'")
      .all(params.id) as Record<string, unknown>[];

    const result = {
      _meta: {
        domain: "customers",
        output_type: "detail",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      customer: {
        ...customer,
        recent_orders: recentOrders,
        metafields,
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
