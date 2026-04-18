/**
 * slam_inventory_by_location — stock distribution across locations.
 *
 * Wraps the inventory_by_location TEMP view. Answers "how is my inventory
 * distributed across warehouses/stores?"
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  location_id: z
    .string()
    .optional()
    .describe("Optional: filter to a single location by Shopify GID"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const inventoryByLocation: ToolDef = {
  name: "slam_inventory_by_location",
  description:
    "Returns inventory stock totals aggregated by location (warehouse/store). Shows available, on_hand, reserved, and committed units per location.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const filterBindings: unknown[] = [];
    const whereClause = params.location_id
      ? (filterBindings.push(params.location_id), "WHERE location_id = ?")
      : "";

    const rows = db
      .prepare(
        `SELECT location_id, item_count, total_available, total_on_hand, total_reserved, total_committed
         FROM inventory_by_location
         ${whereClause}
         ORDER BY total_available DESC`,
      )
      .all(...filterBindings) as Record<string, unknown>[];

    const totals = rows.reduce<{
      item_count: number;
      total_available: number;
      total_on_hand: number;
      total_reserved: number;
      total_committed: number;
    }>(
      (acc, r) => ({
        item_count: acc.item_count + (r.item_count as number),
        total_available: acc.total_available + (r.total_available as number),
        total_on_hand: acc.total_on_hand + (r.total_on_hand as number),
        total_reserved: acc.total_reserved + (r.total_reserved as number),
        total_committed: acc.total_committed + (r.total_committed as number),
      }),
      { item_count: 0, total_available: 0, total_on_hand: 0, total_reserved: 0, total_committed: 0 },
    );

    const result = {
      _meta: {
        domain: "inventory",
        output_type: "summary",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: 0,
        has_more: false,
        ...(params.location_id ? { location_id: params.location_id } : {}),
      },
      totals,
      by_location: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
