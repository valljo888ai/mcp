/**
 * slam_vendors_summary — revenue and sales performance grouped by vendor.
 *
 * Answers "which vendors are driving my revenue?" using the product_sales view.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const SORT_COLUMNS = ["total_revenue", "units_sold", "order_count", "product_count"] as const;

const schema = {
  sort_by: z
    .enum(SORT_COLUMNS)
    .default("total_revenue")
    .describe(
      "Metric to sort by: total_revenue, units_sold, order_count, or product_count (default: total_revenue)",
    ),
  sort_order: z
    .enum(["ASC", "DESC"])
    .default("DESC")
    .describe("Sort direction (default DESC)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Max vendors to return (1–100, default 25)"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const vendorsSummary: ToolDef = {
  name: "slam_vendors_summary",
  description:
    "Returns sales performance grouped by vendor — total revenue, units sold, order count, and product count per vendor. Sorted by revenue by default.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const sortCol = SORT_COLUMNS.includes(params.sort_by) ? params.sort_by : "total_revenue";
    const sortDir = params.sort_order === "ASC" ? "ASC" : "DESC";

    const orderExpr =
      sortCol === "total_revenue"
        ? `SUM(COALESCE(CAST(ps.total_revenue AS REAL), 0)) ${sortDir}`
        : sortCol === "product_count"
        ? `COUNT(DISTINCT ps.product_id) ${sortDir}`
        : `SUM(ps.${sortCol}) ${sortDir}`;

    const sql = `
      SELECT
        ps.vendor,
        COUNT(DISTINCT ps.product_id) AS product_count,
        COALESCE(SUM(ps.order_count), 0) AS order_count,
        COALESCE(SUM(ps.units_sold), 0) AS units_sold,
        SUM(COALESCE(CAST(ps.total_revenue AS REAL), 0)) AS total_revenue
      FROM product_sales ps
      GROUP BY ps.vendor
      ORDER BY ${orderExpr}
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(params.limit) as {
      vendor: string;
      product_count: number;
      order_count: number;
      units_sold: number;
      total_revenue: number;
    }[];

    const result = {
      _meta: {
        domain: "products",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        sort_by: sortCol,
        sort_order: sortDir,
        money_warning:
          "total_revenue is CAST from TEXT to REAL — floating-point arithmetic applies.",
      },
      vendors: rows.map((r) => ({
        ...r,
        total_revenue: r.total_revenue.toFixed(2),
      })),
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
