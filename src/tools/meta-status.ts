/**
 * slam_meta_status — sync metadata, freshness, row counts per entity.
 */

import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const ENTITY_TABLES = [
  "products",
  "variants",
  "collections",
  "orders",
  "order_line_items",
  "customers",
  "metafields",
  "inventory_items",
  "inventory_levels",
] as const;

export const metaStatus: ToolDef = {
  name: "slam_meta_status",
  description:
    "Returns sync metadata (last sync time, minutes since sync) and row counts for every entity table in the SLAM database.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const freshness = getFreshness(db);

    const counts: Record<string, number> = {};
    for (const table of ENTITY_TABLES) {
      const row = db
        .prepare(`SELECT COUNT(*) AS cnt FROM ${table}`)
        .get() as { cnt: number } | undefined;
      counts[table] = row?.cnt ?? 0;
    }

    // List TEMP views so AI can discover available_views without trial-and-error
    const viewRows = db
      .prepare("SELECT name FROM sqlite_temp_master WHERE type = 'view' ORDER BY name")
      .all() as { name: string }[];
    const availableViews = viewRows.map((r) => r.name);

    const result = {
      _meta: {
        domain: "meta",
        output_type: "status",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      entity_counts: counts,
      available_views: availableViews,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
