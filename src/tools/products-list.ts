/**
 * slam_products_list — paginated product list with variant counts.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const SORT_COLUMNS = ["title", "vendor", "product_type", "status", "created_at", "updated_at"] as const;

const schema = {
  limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return (1-100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
  status: z.string().optional().describe("Filter by product status (e.g. 'ACTIVE', 'DRAFT', 'ARCHIVED')"),
  vendor: z.string().optional().describe("Filter by vendor name"),
  product_type: z.string().optional().describe("Filter by product type"),
  data_quality: z.enum(["no_description", "no_tags"]).optional()
    .describe("Filter to products with a specific data quality gap: 'no_description' (empty body_html), 'no_tags' (no rows in product_tags)"),
  sort_by: z.enum(SORT_COLUMNS).default("title").describe("Column to sort by"),
  sort_order: z.enum(["ASC", "DESC"]).default("ASC").describe("Sort direction"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const productsList: ToolDef = {
  name: "slam_products_list",
  description:
    "Returns a paginated list of products with variant counts. Supports filtering by status, vendor, and product_type. Use the data_quality parameter to filter to products with content gaps (e.g. 'no_description' returns only products with empty body_html).",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.status) {
      where.push("p.status = ?");
      filterBindings.push(params.status);
    }
    if (params.vendor) {
      where.push("p.vendor = ?");
      filterBindings.push(params.vendor);
    }
    if (params.product_type) {
      where.push("p.product_type = ?");
      filterBindings.push(params.product_type);
    }
    if (params.data_quality === "no_description") {
      where.push("(p.description_html IS NULL OR p.description_html = '')");
    }
    if (params.data_quality === "no_tags") {
      where.push("NOT EXISTS (SELECT 1 FROM product_tags pt WHERE pt.product_id = p.id)");
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    // Allowlisted sort columns — safe from injection
    const sortCol = SORT_COLUMNS.includes(params.sort_by) ? params.sort_by : "title";
    const sortDir = params.sort_order === "DESC" ? "DESC" : "ASC";

    const sql = `
      SELECT
        p.id, p.title, p.handle, p.status, p.vendor, p.product_type, p.tags,
        p.created_at, p.updated_at,
        COUNT(v.id) AS variant_count
      FROM products p
      LEFT JOIN variants v ON v.product_id = p.id
      ${whereClause}
      GROUP BY p.id
      ORDER BY p.${sortCol} ${sortDir}
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    // Count total for has_more
    const countSql = `SELECT COUNT(*) AS cnt FROM products p ${whereClause}`;
    const countRow = db.prepare(countSql).get(...filterBindings) as { cnt: number } | undefined;
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
