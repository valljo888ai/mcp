import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const customersByTag: ToolDef = {
  name: "slam_customers_by_tag",
  description: "Returns customer tag distribution from the customer_tags table. Shows which tags are most common and how many customers have each.",
  schema: {
    limit: z.number().int().min(1).max(100).default(50).describe("Max tags to return (default 50)"),
    offset: z.number().int().min(0).default(0).describe("Tags to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const rows = db.prepare(`
      SELECT ct.tag, COUNT(*) AS customer_count
      FROM customer_tags ct
      GROUP BY ct.tag
      ORDER BY customer_count DESC
      LIMIT ? OFFSET ?
    `).all(params.limit, params.offset) as Record<string, unknown>[];

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "customers",
            output_type: "tags",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
          },
          tags: rows,
        }, null, 2),
      }],
    };
  }),
};
