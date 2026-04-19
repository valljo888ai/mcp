/**
 * slam_selling_plans_list — subscription selling plan groups with plan and product counts.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const sellingPlansList: ToolDef = {
  name: "slam_selling_plans_list",
  description: "Returns subscription selling plan groups with plan and product counts.",
  schema: {
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const rows = db.prepare(`
      SELECT spg.id, spg.name, spg.merchant_code,
             COUNT(DISTINCT sp.id) AS plan_count,
             COUNT(DISTINCT spgp.product_id) AS product_count
      FROM selling_plan_groups spg
      LEFT JOIN selling_plans sp ON sp.selling_plan_group_id = spg.id
      LEFT JOIN selling_plan_group_products spgp ON spgp.selling_plan_group_id = spg.id
      GROUP BY spg.id
      ORDER BY spg.name
      LIMIT ? OFFSET ?
    `).all(params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db.prepare("SELECT COUNT(*) AS cnt FROM selling_plan_groups").get() as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "subscriptions",
            output_type: "list",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
            has_more: params.offset + rows.length < (countRow?.cnt ?? 0),
            total_count: countRow?.cnt ?? 0,
          },
          plans: rows,
        }, null, 2),
      }],
    };
  }),
};
