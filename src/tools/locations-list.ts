/**
 * slam_locations_list — all fulfilment locations with stock totals.
 */

import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const locationsList: ToolDef = {
  name: "slam_locations_list",
  description: "Returns all fulfilment locations with stock totals. Uses the inventory_by_location view.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const freshness = getFreshness(db);

    const rows = db.prepare(`
      SELECT l.id, l.name, l.active, l.address1, l.city, l.province, l.country,
             COALESCE(ibl.total_available, 0) AS total_available,
             COALESCE(ibl.item_count, 0) AS item_count
      FROM locations l
      LEFT JOIN inventory_by_location ibl ON ibl.location_id = l.id
      ORDER BY l.name
    `).all() as Record<string, unknown>[];

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "inventory",
            output_type: "locations",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
          },
          locations: rows,
        }, null, 2),
      }],
    };
  }),
};
