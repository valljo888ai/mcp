/**
 * slam_variants_get — single variant with parent product info.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  id: z.string().describe("The variant ID (Shopify GID)"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const variantsGet: ToolDef = {
  name: "slam_variants_get",
  description:
    "Returns a single variant by ID, including parent product information, inventory items, and inventory levels.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const variant = db
      .prepare(
        `SELECT v.*, p.title AS product_title, p.handle AS product_handle,
                p.status AS product_status, p.vendor AS product_vendor
         FROM variants v
         JOIN products p ON p.id = v.product_id
         WHERE v.id = ?`,
      )
      .get(params.id) as Record<string, unknown> | undefined;

    if (!variant) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              _meta: {
                domain: "variants",
                output_type: "detail",
                last_sync_at: freshness.last_sync_at,
                minutes_since_sync: freshness.minutes_since_sync,
                freshness_tier: freshness.freshness_tier,
                returned: 0,
                offset: 0,
                has_more: false,
              },
              error: `Variant not found: ${params.id}`,
            }, null, 2),
          },
        ],
      };
    }

    // Get inventory items and levels
    const inventoryItems = db
      .prepare("SELECT * FROM inventory_items WHERE variant_id = ?")
      .all(params.id) as Record<string, unknown>[];

    const inventoryItemIds = inventoryItems.map((ii) => ii["id"] as string);

    let inventoryLevels: Record<string, unknown>[] = [];
    if (inventoryItemIds.length > 0) {
      const placeholders = inventoryItemIds.map(() => "?").join(", ");
      inventoryLevels = db
        .prepare(
          `SELECT * FROM inventory_levels WHERE inventory_item_id IN (${placeholders})`,
        )
        .all(...inventoryItemIds) as Record<string, unknown>[];
    }

    const result = {
      _meta: {
        domain: "variants",
        output_type: "detail",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      variant: {
        ...variant,
        inventory_items: inventoryItems,
        inventory_levels: inventoryLevels,
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
