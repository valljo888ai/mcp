/**
 * slam_products_search — LIKE search across title, vendor, product_type, tags.
 *
 * Phase 1: LIKE-based search. FTS5 upgrade planned for later.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  query: z.string().min(1).describe("Search term (matched with LIKE against title, vendor, product_type, tags)"),
  limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return (1-100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const productsSearch: ToolDef = {
  name: "slam_products_search",
  description:
    "Searches products by title, vendor, product_type, or tags using LIKE matching. Returns paginated results with variant counts.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const pattern = `%${params.query}%`;

    const sql = `
      SELECT
        p.id, p.title, p.handle, p.status, p.vendor, p.product_type, p.tags,
        p.created_at, p.updated_at,
        COUNT(v.id) AS variant_count
      FROM products p
      LEFT JOIN variants v ON v.product_id = p.id
      WHERE p.title LIKE ?
         OR p.vendor LIKE ?
         OR p.product_type LIKE ?
         OR p.tags LIKE ?
      GROUP BY p.id
      ORDER BY p.title ASC
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(sql)
      .all(pattern, pattern, pattern, pattern, params.limit, params.offset) as Record<string, unknown>[];

    // Count total matches
    const countSql = `
      SELECT COUNT(*) AS cnt FROM products p
      WHERE p.title LIKE ?
         OR p.vendor LIKE ?
         OR p.product_type LIKE ?
         OR p.tags LIKE ?
    `;
    const countRow = db
      .prepare(countSql)
      .get(pattern, pattern, pattern, pattern) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "products",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
      },
      products: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
