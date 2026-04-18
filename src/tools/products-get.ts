/**
 * slam_products_get — single product with all variants, collections, metafields.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  id: z.string().describe("The product ID (Shopify GID)"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const productsGet: ToolDef = {
  name: "slam_products_get",
  description:
    "Returns a single product by ID, including all its variants, collection memberships, and metafields.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const product = db
      .prepare("SELECT * FROM products WHERE id = ?")
      .get(params.id) as Record<string, unknown> | undefined;

    if (!product) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              _meta: {
                domain: "products",
                output_type: "detail",
                last_sync_at: freshness.last_sync_at,
                minutes_since_sync: freshness.minutes_since_sync,
                freshness_tier: freshness.freshness_tier,
                returned: 0,
                offset: 0,
                has_more: false,
              },
              error: `Product not found: ${params.id}`,
            }, null, 2),
          },
        ],
      };
    }

    const variants = db
      .prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY position ASC")
      .all(params.id) as Record<string, unknown>[];

    const collections = db
      .prepare(
        `SELECT c.id, c.title, c.handle
         FROM collections c
         JOIN collects cm ON cm.collection_id = c.id
         WHERE cm.product_id = ?`,
      )
      .all(params.id) as Record<string, unknown>[];

    const metafields = db
      .prepare("SELECT * FROM metafields WHERE owner_id = ? AND owner_type = 'PRODUCT'")
      .all(params.id) as Record<string, unknown>[];

    const result = {
      _meta: {
        domain: "products",
        output_type: "detail",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      product: {
        ...product,
        variants,
        collections,
        metafields,
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
