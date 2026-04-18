/**
 * slam_returns_summary — return records from the returns table.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const returnsSummary: ToolDef = {
  name: "slam_returns_summary",
  description: "Returns return records from the returns table, joined with return line item counts.",
  schema: {
    status: z.string().optional().describe("Filter by return status (e.g. 'OPEN', 'CLOSED', 'CANCELLED')"),
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { status?: string; limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where = params.status ? "WHERE r.status = ?" : "";
    const bindings: unknown[] = params.status ? [params.status] : [];

    const rows = db.prepare(`
      SELECT r.id, r.order_id, r.status, r.created_at,
             COUNT(rli.id) AS line_item_count
      FROM returns r
      LEFT JOIN return_line_items rli ON rli.return_id = r.id
      ${where}
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...bindings, params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM returns r ${where}`).get(...bindings) as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "orders",
            output_type: "returns",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
            has_more: params.offset + rows.length < (countRow?.cnt ?? 0),
          },
          returns: rows,
        }, null, 2),
      }],
    };
  }),
};
