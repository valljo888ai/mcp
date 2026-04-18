/**
 * slam_products_for_collection — all products in a collection with sales metrics.
 *
 * Inverse of slam_collections_for_product. Answers "what's in this collection?"
 * and enriches each product with order_count, units_sold, total_revenue from
 * the product_sales TEMP view.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const SORT_COLUMNS = ["title", "vendor", "total_revenue", "units_sold"] as const;

const schema = {
  collection_id: z
    .string()
    .describe("The collection ID (Shopify GID)"),
  sort_by: z
    .enum(SORT_COLUMNS)
    .default("title")
    .describe("Column to sort by: title, vendor, total_revenue, or units_sold"),
  sort_order: z
    .enum(["ASC", "DESC"])
    .default("ASC")
    .describe("Sort direction (default ASC)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Max rows to return (1–100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const productsForCollection: ToolDef = {
  name: "slam_products_for_collection",
  description:
    "Returns all products in a collection, each enriched with variant count and sales metrics (order_count, units_sold, total_revenue) from the product_sales view. Products with no sales show zeros.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const sortCol = SORT_COLUMNS.includes(params.sort_by)
      ? params.sort_by
      : "title";
    const sortDir = params.sort_order === "DESC" ? "DESC" : "ASC";

    // Resolve sort column — revenue/units come from the ps alias
    const orderBy =
      sortCol === "total_revenue" || sortCol === "units_sold"
        ? `COALESCE(ps.${sortCol}, 0) ${sortDir}`
        : `p.${sortCol} ${sortDir}`;

    const sql = `
      SELECT
        p.id, p.title, p.vendor, p.product_type, p.status, p.handle,
        COUNT(DISTINCT v.id) AS variant_count,
        COALESCE(ps.order_count, 0) AS order_count,
        COALESCE(ps.units_sold, 0) AS units_sold,
        CAST(COALESCE(ps.total_revenue, '0') AS REAL) AS total_revenue
      FROM products p
      JOIN collects cm ON cm.product_id = p.id
      LEFT JOIN variants v ON v.product_id = p.id
      LEFT JOIN product_sales ps ON ps.product_id = p.id
      WHERE cm.collection_id = ?
      GROUP BY p.id
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(sql)
      .all(params.collection_id, params.limit, params.offset) as Record<
      string,
      unknown
    >[];

    const countRow = db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) AS cnt
         FROM products p
         JOIN collects cm ON cm.product_id = p.id
         WHERE cm.collection_id = ?`,
      )
      .get(params.collection_id) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "collections",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
        collection_id: params.collection_id,
        money_warning:
          "total_revenue is CAST from TEXT to REAL — floating-point arithmetic applies.",
      },
      products: rows.map((r) => ({
        ...r,
        total_revenue:
          typeof r.total_revenue === "number"
            ? r.total_revenue.toFixed(2)
            : r.total_revenue,
      })),
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
