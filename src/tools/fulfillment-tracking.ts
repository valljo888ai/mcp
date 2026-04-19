import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const fulfillmentTracking: ToolDef = {
  name: "slam_fulfillment_tracking",
  description: "Returns fulfillment records from the fulfillments table. Filter by order or status.",
  schema: {
    order_id: z.string().optional().describe("Filter to fulfillments for a specific order"),
    status: z.string().optional().describe("Filter by status (e.g. 'success', 'pending', 'cancelled')"),
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { order_id?: string; status?: string; limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const bindings: unknown[] = [];
    if (params.order_id) { where.push("f.order_id = ?"); bindings.push(params.order_id); }
    if (params.status) { where.push("f.status = ?"); bindings.push(params.status); }
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = db.prepare(`
      SELECT f.id, f.order_id, o.name AS order_name, f.status,
             f.created_at, f.updated_at, f.tracking_company, f.tracking_numbers,
             f.tracking_urls, f.shipment_status, f.location_id
      FROM fulfillments f
      JOIN orders o ON o.id = f.order_id
      ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...bindings, params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM fulfillments f ${whereClause}`).get(...bindings) as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "orders",
            output_type: "fulfillments",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
            has_more: params.offset + rows.length < (countRow?.cnt ?? 0),
            total_count: countRow?.cnt ?? 0,
          },
          fulfillments: rows,
        }, null, 2),
      }],
    };
  }),
};
