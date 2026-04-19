import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const productImages: ToolDef = {
  name: "slam_product_images",
  description: "Returns product images from the product_media table. Supports filtering by product_id.",
  schema: {
    product_id: z.string().optional().describe("Filter to images for a specific product"),
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (1-100, default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { product_id?: string; limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where = params.product_id ? "WHERE pm.media_content_type = 'IMAGE' AND pm.product_id = ?" : "WHERE pm.media_content_type = 'IMAGE'";
    const bindings = params.product_id ? [params.product_id, params.limit, params.offset] : [params.limit, params.offset];

    const sql = `
      SELECT pm.id, pm.product_id, p.title AS product_title, pm.alt,
             pm.media_content_type, pm.position, pm.status
      FROM product_media pm
      JOIN products p ON p.id = pm.product_id
      ${where}
      ORDER BY pm.product_id, pm.position
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...bindings) as Record<string, unknown>[];
    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM product_media pm ${where}`).get(...(params.product_id ? [params.product_id] : [])) as { cnt: number } | undefined;

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "products",
            output_type: "images",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
            has_more: params.offset + rows.length < (countRow?.cnt ?? 0),
            total_count: countRow?.cnt ?? 0,
          },
          images: rows,
        }, null, 2),
      }],
    };
  }),
};
