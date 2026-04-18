import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const variantOptions: ToolDef = {
  name: "slam_variant_options",
  description: "Returns product option names and values from the product_options table (option_values stored as JSON).",
  schema: {
    product_id: z.string().describe("The product ID to fetch options for"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { product_id: string };
    const { db } = getDb();
    const freshness = getFreshness(db);

    // Gadget stores option values as JSON in product_options.option_values
    const rows = db.prepare(`
      SELECT po.id AS option_id, po.product_id, po.name AS option_name,
             po.position, po.option_values
      FROM product_options po
      WHERE po.product_id = ?
      ORDER BY po.position
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
