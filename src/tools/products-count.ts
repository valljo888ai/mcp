/**
 * slam_products_count — count with optional filters.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  status: z.string().optional().describe("Filter by product status (e.g. 'active', 'draft', 'archived') — case-insensitive"),
  vendor: z.string().optional().describe("Filter by vendor name"),
  product_type: z.string().optional().describe("Filter by product type"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const productsCount: ToolDef = {
  name: "slam_products_count",
  description:
    "Returns the total count of products, optionally filtered by status, vendor, or product_type.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const bindings: unknown[] = [];

    if (params.status) {
      where.push("LOWER(status) = LOWER(?)");
      bindings.push(params.status);
    }
    if (params.vendor) {
      where.push("vendor = ?");
      bindings.push(params.vendor);
    }
    if (params.product_type) {
      where.push("product_type = ?");
      bindings.push(params.product_type);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const row = db
      .prepare(`SELECT COUNT(*) AS cnt FROM products ${whereClause}`)
      .get(...bindings) as { cnt: number } | undefined;

    const count = row?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "products",
        output_type: "count",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: 1,
        offset: 0,
        has_more: false,
      },
      count,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
