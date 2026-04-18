/**
 * slam_gift_cards_summary — outstanding gift card balance summary grouped by currency.
 */

import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const giftCardsSummary: ToolDef = {
  name: "slam_gift_cards_summary",
  description: "Returns outstanding gift card balance summary grouped by currency.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const freshness = getFreshness(db);

    const rows = db.prepare(`
      SELECT currency,
             COUNT(*) AS total_count,
             SUM(CASE WHEN disabled_at IS NULL THEN 1 ELSE 0 END) AS active_count,
             ROUND(SUM(CAST(balance AS REAL)), 2) AS total_outstanding_balance,
             ROUND(SUM(CAST(initial_value AS REAL)), 2) AS total_issued_value
      FROM gift_cards
      GROUP BY currency
      ORDER BY total_outstanding_balance DESC
    `).all() as Record<string, unknown>[];

    const total = rows.reduce((sum, r) => sum + ((r["total_outstanding_balance"] as number) ?? 0), 0);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "gift_cards",
            output_type: "summary",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
          },
          total_outstanding_balance: total,
          by_currency: rows,
        }, null, 2),
      }],
    };
  }),
};
