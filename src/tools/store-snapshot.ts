/**
 * slam_store_snapshot — one-call store health overview.
 *
 * Gadget schema: all queries use Gadget table names (order_line_items, etc.).
 * The variant_stock_health view already has correct joins in views.ts.
 */

import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const storeSnapshot: ToolDef = {
  name: "slam_store_snapshot",
  description:
    "Returns a one-call store health snapshot: sales totals, inventory counts, " +
    "data condition issue counts, and sync freshness. Answers 'what is the state " +
    "of my store right now?' without requiring multiple tool calls.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const freshness = getFreshness(db);

    // Sales
    const salesRow = db
      .prepare(
        `SELECT
          COUNT(*) AS total_orders,
          COALESCE(SUM(CAST(total_price AS REAL)), 0) AS total_revenue,
          COUNT(CASE WHEN financial_status = 'paid' THEN 1 END) AS paid_orders,
          COUNT(CASE WHEN financial_status = 'pending' THEN 1 END) AS pending_orders
        FROM orders`,
      )
      .get() as {
      total_orders: number;
      total_revenue: number;
      paid_orders: number;
      pending_orders: number;
    };

    // Inventory (use variant_stock_health view — confirmed in views.ts)
    const totalSkusRow = db.prepare("SELECT COUNT(*) AS cnt FROM inventory_items").get() as { cnt: number } | undefined;
    const totalSkus = totalSkusRow?.cnt ?? 0;

    const outOfStockRow = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM variant_stock_health WHERE total_available = 0",
      )
      .get() as { cnt: number } | undefined;
    const outOfStock = outOfStockRow?.cnt ?? 0;

    const lowStockRow = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM variant_stock_health WHERE total_available > 0 AND total_available <= 5",
      )
      .get() as { cnt: number } | undefined;
    const lowStock = lowStockRow?.cnt ?? 0;

    // Conditions issue counts (direct COUNTs — faster than runChecks())
    const contentIssuesRow = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM products WHERE body_html IS NULL OR TRIM(body_html) = ''",
      )
      .get() as { cnt: number } | undefined;
    const contentIssues = contentIssuesRow?.cnt ?? 0;

    const identifierIssuesRow = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM variants WHERE sku IS NULL OR TRIM(sku) = ''",
      )
      .get() as { cnt: number } | undefined;
    const identifierIssues = identifierIssuesRow?.cnt ?? 0;

    const pricingExceptionsRow = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM variants WHERE compare_at_price IS NOT NULL AND CAST(compare_at_price AS REAL) < CAST(price AS REAL)",
      )
      .get() as { cnt: number } | undefined;
    const pricingExceptions = pricingExceptionsRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "meta",
        output_type: "snapshot",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
      },
      snapshot: {
        sales: {
          total_orders: salesRow.total_orders,
          total_revenue: salesRow.total_revenue.toFixed(2),
          paid_orders: salesRow.paid_orders,
          pending_orders: salesRow.pending_orders,
        },
        inventory: {
          total_skus_tracked: totalSkus,
          out_of_stock: outOfStock,
          low_stock: lowStock,
        },
        conditions: {
          content_issues: contentIssues,
          identifier_issues: identifierIssues,
          pricing_exceptions: pricingExceptions,
          inventory_issues: outOfStock,
        },
        sync: {
          last_sync_at: freshness.last_sync_at,
          minutes_since_sync: freshness.minutes_since_sync,
          freshness_tier: freshness.freshness_tier,
        },
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
