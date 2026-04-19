/**
 * slam_collections_for_product — all collections containing a product.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  product_id: z.string().describe("The product ID (Shopify GID)"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const collectionsForProduct: ToolDef = {
  name: "slam_collections_for_product",
  description:
    "Returns all collections that contain the specified product.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const collections = db
      .prepare(
        `SELECT
           c.id, c.title, c.handle, c.sort_order, c.rules,
           CASE WHEN c.rules IS NOT NULL THEN 'smart' ELSE 'custom' END AS collection_type
         FROM collections c
         JOIN collects cm ON cm.collection_id = c.id
         WHERE cm.product_id = ?
         ORDER BY c.title ASC`,
      )
      .all(params.product_id) as Record<string, unknown>[];

    const result = {
      _meta: {
        domain: "collections",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: collections.length,
        total_count: collections.length,
        offset: 0,
        has_more: false,
      },
      product_id: params.product_id,
      collections,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
