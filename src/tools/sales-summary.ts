/**
 * slam_sales_summary — store sales dashboard in one call.
 *
 * Returns total orders, revenue, AOV, breakdown by financial and fulfillment
 * status, and top 5 products by revenue. Uses the product_sales TEMP view.
 *
 * Money note: Shopify stores prices as TEXT. All revenue values are CAST to
 * REAL for arithmetic and returned as strings formatted to 2 decimal places.
 *
 * Gadget schema: product_sales view joins on order_line_items (not line_items).
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  financial_status: z
    .string()
    .optional()
    .describe(
      "Optional: filter to a single financial status (e.g. 'PAID', 'PENDING', 'REFUNDED')",
    ),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

function fmt(n: number): string {
  return n.toFixed(2);
}

export const salesSummary: ToolDef = {
  name: "slam_sales_summary",
  description:
    "Returns a store sales dashboard: total orders, total revenue, average order value, breakdown by financial and fulfillment status, and top 5 products by revenue. Optionally filter by financial_status.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const filterBindings: unknown[] = [];
    const whereClause = params.financial_status
      ? (filterBindings.push(params.financial_status), "WHERE financial_status = ?")
      : "";

    // Aggregate totals
    const agg = db
      .prepare(
        `SELECT
           COUNT(*) AS total_orders,
           COALESCE(SUM(CAST(total_price AS REAL)), 0) AS total_revenue,
           COALESCE(AVG(CAST(total_price AS REAL)), 0) AS avg_order_value
         FROM orders ${whereClause}`,
      )
      .get(...filterBindings) as {
      total_orders: number;
      total_revenue: number;
      avg_order_value: number;
    };

    // By financial status
    const byFinancial = db
      .prepare(
        `SELECT
           financial_status,
           COUNT(*) AS cnt,
           COALESCE(SUM(CAST(total_price AS REAL)), 0) AS revenue
         FROM orders
         GROUP BY financial_status
         ORDER BY revenue DESC`,
      )
      .all() as { financial_status: string; cnt: number; revenue: number }[];

    // By fulfillment status
    const byFulfillment = db
      .prepare(
        `SELECT fulfillment_status, COUNT(*) AS cnt
         FROM orders
         GROUP BY fulfillment_status
         ORDER BY cnt DESC`,
      )
      .all() as { fulfillment_status: string; cnt: number }[];

    // Top 5 products by revenue (product_sales TEMP view — joins order_line_items)
    const topProducts = db
      .prepare(
        `SELECT product_id, product_title, vendor, order_count, units_sold,
                COALESCE(CAST(total_revenue AS REAL), 0) AS total_revenue
         FROM product_sales
         ORDER BY COALESCE(CAST(total_revenue AS REAL), 0) DESC
         LIMIT 5`,
      )
      .all() as {
      product_id: string;
      product_title: string;
      vendor: string;
      order_count: number;
      units_sold: number;
      total_revenue: number;
    }[];

    const byFinancialMap: Record<string, { count: number; revenue: string }> =
      {};
    for (const row of byFinancial) {
      byFinancialMap[row.financial_status] = {
        count: row.cnt,
        revenue: fmt(row.revenue),
      };
    }

    const byFulfillmentMap: Record<string, number> = {};
    for (const row of byFulfillment) {
      byFulfillmentMap[row.fulfillment_status ?? "null"] = row.cnt;
    }

    const result = {
      _meta: {
        domain: "sales",
        output_type: "summary",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        money_warning:
          "Prices are stored as TEXT in SLAM and CAST to REAL for arithmetic. Revenue figures may have floating-point rounding.",
        ...(params.financial_status
          ? { filtered_to_financial_status: params.financial_status }
          : {}),
      },
      summary: {
        total_orders: agg.total_orders,
        total_revenue: fmt(agg.total_revenue),
        avg_order_value: fmt(agg.avg_order_value),
        by_financial_status: byFinancialMap,
        by_fulfillment_status: byFulfillmentMap,
        top_products: topProducts.map((p) => ({
          product_id: p.product_id,
          product_title: p.product_title,
          vendor: p.vendor,
          order_count: p.order_count,
          units_sold: p.units_sold,
          total_revenue: fmt(p.total_revenue),
        })),
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
