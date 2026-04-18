/**
 * slam_inventory_summary — aggregated inventory statistics.
 */

import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const inventorySummary: ToolDef = {
  name: "slam_inventory_summary",
  description:
    "Returns aggregated inventory statistics: total SKUs tracked, total units, units by location, out-of-stock count, and low stock count.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const freshness = getFreshness(db);

    // Total SKUs tracked (distinct inventory items)
    const totalSkus = db
      .prepare("SELECT COUNT(*) AS cnt FROM inventory_items")
      .get() as { cnt: number };

    // Total available units across all locations
    const totalUnits = db
      .prepare("SELECT COALESCE(SUM(available), 0) AS total FROM inventory_levels")
      .get() as { total: number };

    // Units by location
    const unitsByLocation = db
      .prepare(
        `SELECT location_id, COALESCE(SUM(available), 0) AS total_available
         FROM inventory_levels
         GROUP BY location_id
         ORDER BY total_available DESC`,
      )
      .all() as Record<string, unknown>[];

    // Out-of-stock: variants where total_available (from inventory_levels) = 0
    const outOfStock = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM variant_stock_health WHERE total_available = 0",
      )
      .get() as { cnt: number };

    // Low stock: variants where total_available > 0 AND <= threshold (default 5)
    const lowStockThreshold = 5;
    const lowStock = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM variant_stock_health WHERE total_available > 0 AND total_available <= ?",
      )
      .get(lowStockThreshold) as { cnt: number };

    const result = {
      _meta: {
        domain: "inventory",
        output_type: "summary",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      summary: {
        total_skus_tracked: totalSkus.cnt,
        total_available_units: totalUnits.total,
        units_by_location: unitsByLocation,
        out_of_stock_variants: outOfStock.cnt,
        low_stock_variants: lowStock.cnt,
        low_stock_threshold: lowStockThreshold,
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
