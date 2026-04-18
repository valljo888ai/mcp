/**
 * slam_discounts_active — active discount codes from the discounts table.
 *
 * Shows current live promotions (not order_discount_codes).
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const discountsActive: ToolDef = {
  name: "slam_discounts_active",
  description: "Returns active discount codes from the discounts table (not order_discount_codes). Shows current live promotions.",
  schema: {
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const rows = db.prepare(`
      SELECT id, title, status, discount_type, value, value_type,
             starts_at, ends_at, usage_count, applies_to_type
      FROM discounts
      WHERE status = 'ACTIVE'
        AND (ends_at IS NULL OR ends_at > datetime('now'))
      ORDER BY starts_at DESC
      LIMIT ? OFFSET ?
    `).all(params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db.prepare(
      "SELECT COUNT(*) AS cnt FROM discounts WHERE status = 'ACTIVE' AND (ends_at IS NULL OR ends_at > datetime('now'))"
    ).get() as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "discounts",
            output_type: "list",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
            has_more: params.offset + rows.length < (countRow?.cnt ?? 0),
          },
          discounts: rows,
        }, null, 2),
      }],
    };
  }),
};
