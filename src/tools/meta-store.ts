/**
 * slam_meta_store — store info from _slam_meta (shop domain, currency, timezone).
 */

import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const metaStore: ToolDef = {
  name: "slam_meta_store",
  description:
    "Returns store information from the SLAM metadata table: shop domain, currency, timezone, and other store-level settings.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const freshness = getFreshness(db);

    // Gadget _slam_meta has named columns (not key/value)
    let store: Record<string, string | null> = {};
    try {
      const row = db.prepare("SELECT * FROM _slam_meta LIMIT 1").get() as Record<string, string | null> | undefined;
      store = row ?? {};
    } catch { /* non-SLAM db */ }

    const result = {
      _meta: {
        domain: "meta",
        output_type: "detail",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      store,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
