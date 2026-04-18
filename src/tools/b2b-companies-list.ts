/**
 * slam_b2b_companies_list — B2B companies with location and contact counts.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const b2bCompaniesList: ToolDef = {
  name: "slam_b2b_companies_list",
  description: "Returns B2B companies with location and contact counts.",
  schema: {
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const rows = db.prepare(`
      SELECT co.id, co.name, co.external_id,
             COUNT(DISTINCT cl.id) AS location_count,
             COUNT(DISTINCT cc.id) AS contact_count
      FROM companies co
      LEFT JOIN company_locations cl ON cl.company_id = co.id
      LEFT JOIN company_contacts cc ON cc.company_id = co.id
      GROUP BY co.id
      ORDER BY co.name
      LIMIT ? OFFSET ?
    `).all(params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db.prepare("SELECT COUNT(*) AS cnt FROM companies").get() as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "b2b",
            output_type: "list",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
            has_more: params.offset + rows.length < (countRow?.cnt ?? 0),
          },
          companies: rows,
        }, null, 2),
      }],
    };
  }),
};
