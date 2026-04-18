import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const refundsSummary: ToolDef = {
  name: "slam_refunds_summary",
  description: "Returns refund records joined with refund line items. Shows refund amounts, reasons, and order context.",
  schema: {
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const rows = db.prepare(`
      SELECT r.id, r.order_id, o.name AS order_name, r.note, r.created_at, r.restock_type,
             COUNT(rli.id) AS line_item_count,
             COALESCE(SUM(CAST(rli.subtotal AS REAL)), 0) AS total_refund_amount
      FROM refunds r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN refund_line_items rli ON rli.refund_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db.prepare("SELECT COUNT(*) AS cnt FROM refunds").get() as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "orders",
            output_type: "refunds",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
            has_more: params.offset + rows.length < (countRow?.cnt ?? 0),
          },
          refunds: rows,
        }, null, 2),
      }],
    };
  }),
};
