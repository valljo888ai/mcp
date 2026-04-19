/**
 * slam_draft_orders_list — draft orders with line item counts.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const draftOrdersList: ToolDef = {
  name: "slam_draft_orders_list",
  description: "Returns draft orders with line item counts. Draft orders are unpaid/pending orders not yet converted.",
  schema: {
    status: z.string().optional().describe("Filter by status (e.g. 'open', 'completed', 'invoice_sent')"),
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { status?: string; limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where = params.status ? "WHERE do2.status = ?" : "";
    const bindings: unknown[] = params.status ? [params.status] : [];

    const rows = db.prepare(`
      SELECT do2.id, do2.name, do2.email, do2.status, do2.total_price, do2.created_at,
             COUNT(doli.id) AS line_item_count
      FROM draft_orders do2
      LEFT JOIN draft_order_line_items doli ON doli.draft_order_id = do2.id
      ${where}
      GROUP BY do2.id
      ORDER BY do2.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...bindings, params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM draft_orders do2 ${where}`).get(...bindings) as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "orders",
            output_type: "draft_orders",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
            has_more: params.offset + rows.length < (countRow?.cnt ?? 0),
            total_count: countRow?.cnt ?? 0,
          },
          draft_orders: rows.map((r) => ({
            ...r,
            total_price: r["total_price"] != null ? Number(r["total_price"]).toFixed(2) : null,
          })),
        }, null, 2),
      }],
    };
  }),
};
