/**
 * slam_customer_addresses — customer addresses from the customer_addresses table.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const customerAddresses: ToolDef = {
  name: "slam_customer_addresses",
  description: "Returns customer addresses from the customer_addresses table.",
  schema: {
    customer_id: z.string().optional().describe("Filter to addresses for a specific customer"),
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { customer_id?: string; limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where = params.customer_id ? "WHERE ca.customer_id = ?" : "";
    const bindings: unknown[] = params.customer_id ? [params.customer_id] : [];

    const rows = db.prepare(`
      SELECT ca.id, ca.customer_id, c.email, ca.address1, ca.city,
             ca.province, ca.country, ca.is_default
      FROM customer_addresses ca
      JOIN customers c ON c.id = ca.customer_id
      ${where}
      ORDER BY ca.customer_id, ca.is_default DESC
      LIMIT ? OFFSET ?
    `).all(...bindings, params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM customer_addresses ca ${where}`).get(...bindings) as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "customers",
            output_type: "addresses",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
            has_more: params.offset + rows.length < (countRow?.cnt ?? 0),
          },
          addresses: rows,
        }, null, 2),
      }],
    };
  }),
};
