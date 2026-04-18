/**
 * slam_collections_get — single collection with all member products.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  id: z.string().describe("The collection ID (Shopify GID)"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const collectionsGet: ToolDef = {
  name: "slam_collections_get",
  description:
    "Returns a single collection by ID, including all member products.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const collection = db
      .prepare(
        `SELECT c.*,
                CASE WHEN c.rules IS NOT NULL THEN 'smart' ELSE 'custom' END AS collection_type
         FROM collections c
         WHERE c.id = ?`,
      )
      .get(params.id) as Record<string, unknown> | undefined;

    if (!collection) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              _meta: {
                domain: "collections",
                output_type: "detail",
                last_sync_at: freshness.last_sync_at,
                minutes_since_sync: freshness.minutes_since_sync,
                freshness_tier: freshness.freshness_tier,
                returned: 0,
                offset: 0,
                has_more: false,
              },
              error: `Collection not found: ${params.id}`,
            }, null, 2),
          },
        ],
      };
    }

    const products = db
      .prepare(
        `SELECT p.id, p.title, p.handle, p.status, p.vendor, p.product_type
         FROM products p
         JOIN collects cm ON cm.product_id = p.id
         WHERE cm.collection_id = ?
         ORDER BY p.title ASC`,
      )
      .all(params.id) as Record<string, unknown>[];

    const result = {
      _meta: {
        domain: "collections",
        output_type: "detail",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      collection: {
        ...collection,
        products,
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
