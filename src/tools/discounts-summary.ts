import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const discountsSummary: ToolDef = {
  name: "slam_discounts_summary",
  description: "Returns discount code usage summary from order_discount_codes. Shows most-used codes, total discount amounts, and discount types.",
  schema: {
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const rows = db.prepare(`
      SELECT code, type AS discount_type,
             COUNT(*) AS usage_count,
             SUM(CAST(amount AS REAL)) AS total_discount_amount
      FROM order_discount_codes
      GROUP BY code
      ORDER BY usage_count DESC
      LIMIT ? OFFSET ?
    `).all(params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db.prepare("SELECT COUNT(DISTINCT code) AS cnt FROM order_discount_codes").get() as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "orders",
            output_type: "discounts_summary",
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
