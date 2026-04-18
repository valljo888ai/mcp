import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const variantOptions: ToolDef = {
  name: "slam_variant_options",
  description: "Returns product option names and values from the product_options and product_option_values tables.",
  schema: {
    product_id: z.string().describe("The product ID to fetch options for"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { product_id: string };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const rows = db.prepare(`
      SELECT po.id AS option_id, po.product_id, po.name AS option_name, po.position,
             pov.id AS value_id, pov.name AS value_name
      FROM product_options po
      JOIN product_option_values pov ON pov.product_option_id = po.id
      WHERE po.product_id = ?
      ORDER BY po.position, pov.id
    `).all(params.product_id) as Record<string, unknown>[];

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "products",
            output_type: "options",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
          },
          options: rows,
        }, null, 2),
      }],
    };
  }),
};
