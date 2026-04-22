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
      .get() as { cnt: number } | undefined;

    // Total available units via variant_stock_health (uses MAX(inventory_quantity) fallback
    // when inventory_levels.available is NULL — Shopify API 2024-10+ deprecated that field)
    const totalUnits = db
      .prepare("SELECT COALESCE(SUM(total_available), 0) AS total FROM variant_stock_health")
      .get() as { total: number } | undefined;

    // Units by location — inventory_levels.available is NULL (deprecated Shopify API 2024-10+);
    // show item_count per location which is accurate
    const unitsByLocation = db
      .prepare(
        `SELECT il.location_id, l.name AS location_name,
           COUNT(DISTINCT il.inventory_item_id) AS item_count
         FROM inventory_levels il
         LEFT JOIN locations l ON l.id = il.location_id
         GROUP BY il.location_id
         ORDER BY item_count DESC`,
      )
      .all() as Record<string, unknown>[];

    // Out-of-stock: variants where total_available (from inventory_levels) = 0
    const outOfStock = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM variant_stock_health WHERE total_available = 0",
      )
      .get() as { cnt: number } | undefined;

    // Low stock: variants where total_available > 0 AND <= threshold (default 5)
    const lowStockThreshold = 5;
    const lowStock = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM variant_stock_health WHERE total_available > 0 AND total_available <= ?",
      )
      .get(lowStockThreshold) as { cnt: number } | undefined;

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
        total_skus_tracked: totalSkus?.cnt ?? 0,
        total_available_units: totalUnits?.total ?? 0,
        units_by_location: unitsByLocation,
        out_of_stock_variants: outOfStock?.cnt ?? 0,
        low_stock_variants: lowStock?.cnt ?? 0,
        low_stock_threshold: lowStockThreshold,
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
