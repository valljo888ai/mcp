/**
 * slam_products_top — best or worst sellers from the product_sales TEMP view.
 *
 * Answers "what are my best sellers?" or "what has the lowest revenue?"
 * in a single call. Sortable by revenue, units sold, or order count.
 * Filterable by vendor or product_type.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const SORT_COLUMNS = ["total_revenue", "units_sold", "order_count"] as const;

const schema = {
  sort_by: z
    .enum(SORT_COLUMNS)
    .default("total_revenue")
    .describe("Metric to sort by: total_revenue, units_sold, or order_count"),
  sort_order: z
    .enum(["ASC", "DESC"])
    .default("DESC")
    .describe("DESC = best sellers first (default), ASC = worst sellers first"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Max rows to return (1–100, default 25)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of rows to skip"),
  vendor: z.string().optional().describe("Filter to a specific vendor"),
  product_type: z
    .string()
    .optional()
    .describe("Filter to a specific product type"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const productsTop: ToolDef = {
  name: "slam_products_top",
  description:
    "Returns products ranked by sales performance (revenue, units sold, or order count). Supports pagination, sort direction, and optional vendor/product_type filters. Uses the product_sales view which joins orders and line_items — only products with at least one order appear.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.vendor) {
      where.push("ps.vendor = ?");
      filterBindings.push(params.vendor);
    }
    if (params.product_type) {
      where.push("ps.product_type = ?");
      filterBindings.push(params.product_type);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sortCol = SORT_COLUMNS.includes(params.sort_by)
      ? params.sort_by
      : "total_revenue";
    const sortDir = params.sort_order === "ASC" ? "ASC" : "DESC";

    // For revenue, ORDER BY the CAST value so text fields sort numerically.
    const orderExpr =
      sortCol === "total_revenue"
        ? `COALESCE(CAST(ps.total_revenue AS REAL), 0) ${sortDir}`
        : sortCol === "units_sold"
        ? `COALESCE(ps.units_sold, 0) ${sortDir}`
        : sortCol === "order_count"
        ? `COALESCE(ps.order_count, 0) ${sortDir}`
        : `ps.${sortCol} ${sortDir}`;

    const sql = `
      SELECT
        ps.product_id, ps.product_title, ps.vendor, ps.product_type,
        COALESCE(ps.order_count, 0) AS order_count,
        COALESCE(ps.units_sold, 0) AS units_sold,
        COALESCE(CAST(ps.total_revenue AS REAL), 0) AS total_revenue,
        COUNT(DISTINCT v.id) AS variant_count
      FROM product_sales ps
      LEFT JOIN variants v ON v.product_id = ps.product_id
      ${whereClause}
      GROUP BY ps.product_id
      ORDER BY ${orderExpr}
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(sql)
      .all(...filterBindings, params.limit, params.offset) as Record<
      string,
      unknown
    >[];

    const countSql = `SELECT COUNT(*) AS cnt FROM product_sales ps ${whereClause}`;
    const countRow = db
      .prepare(countSql)
      .get(...filterBindings) as { cnt: number } | undefined;
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
        sort_by: sortCol,
        sort_order: sortDir,
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
