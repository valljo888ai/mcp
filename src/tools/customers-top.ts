/**
 * slam_customers_top — best/most loyal customers by spend or order frequency.
 *
 * Answers "who are my VIPs?" and "who has ordered the most?"
 * Mirrors the slam_products_top pattern.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const SORT_COLUMNS = ["total_spent", "orders_count", "avg_order_value"] as const;

const schema = {
  sort_by: z
    .enum(SORT_COLUMNS)
    .default("total_spent")
    .describe(
      "Metric to rank by: total_spent, orders_count, or avg_order_value (default: total_spent)",
    ),
  sort_order: z
    .enum(["ASC", "DESC"])
    .default("DESC")
    .describe("DESC = highest first (default), ASC = lowest first"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Max rows to return (1–100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
  min_orders: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Only include customers with at least this many orders (repeat buyers filter)"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const customersTop: ToolDef = {
  name: "slam_customers_top",
  description:
    "Returns customers ranked by total spend, order count, or average order value. Use min_orders to filter to repeat buyers only.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const filterBindings: unknown[] = [];
    let whereClause = "";
    if (params.min_orders !== undefined) {
      whereClause = "WHERE COALESCE(co.order_count, 0) >= ?";
      filterBindings.push(params.min_orders);
    }

    const sortCol = SORT_COLUMNS.includes(params.sort_by) ? params.sort_by : "total_spent";
    const sortDir = params.sort_order === "ASC" ? "ASC" : "DESC";

    // avg_order_value and total_spent are computed aliases — reference them directly in ORDER BY
    const orderExpr =
      sortCol === "avg_order_value"
        ? `CASE WHEN orders_count > 0 THEN total_spent / orders_count ELSE 0 END ${sortDir}`
        : sortCol === "total_spent"
        ? `total_spent ${sortDir}`
        : `${sortCol} ${sortDir}`;

    // orders_count and total_spent computed live — synced columns are not populated
    const cte = `
      WITH customer_orders AS (
        SELECT customer_id, COUNT(*) AS order_count
        FROM orders
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      ),
      customer_spent AS (
        SELECT customer_id, COALESCE(SUM(CAST(total_price AS REAL)), 0) AS total_spent
        FROM orders
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      )
    `;

    const sql = `
      ${cte}
      SELECT
        c.id, c.email, c.first_name, c.last_name, c.phone,
        COALESCE(co.order_count, 0) AS orders_count,
        COALESCE(cs.total_spent, 0) AS total_spent,
        CASE WHEN COALESCE(co.order_count, 0) > 0
          THEN COALESCE(cs.total_spent, 0) / COALESCE(co.order_count, 1)
          ELSE 0
        END AS avg_order_value
      FROM customers c
      LEFT JOIN customer_orders co ON co.customer_id = c.id
      LEFT JOIN customer_spent cs ON cs.customer_id = c.id
      ${whereClause}
      ORDER BY ${orderExpr}
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(sql)
      .all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db
      .prepare(`${cte} SELECT COUNT(*) AS cnt FROM customers c LEFT JOIN customer_orders co ON co.customer_id = c.id LEFT JOIN customer_spent cs ON cs.customer_id = c.id ${whereClause}`)
      .get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "customers",
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
          "total_spent and avg_order_value are CAST from TEXT to REAL — floating-point arithmetic applies.",
      },
      customers: rows.map((r) => ({
        ...r,
        total_spent:
          typeof r.total_spent === "number" ? r.total_spent.toFixed(2) : r.total_spent,
        avg_order_value:
          typeof r.avg_order_value === "number"
            ? r.avg_order_value.toFixed(2)
            : r.avg_order_value,
      })),
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
