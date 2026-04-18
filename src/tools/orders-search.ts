/**
 * slam_orders_search — search orders by customer email, order name, date range, or status.
 *
 * Designed for support workflows: "find all orders from jane@example.com",
 * "show unfulfilled orders from last week", etc.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  query: z
    .string()
    .optional()
    .describe("Search term matched against customer email (LIKE) or order name (LIKE)"),
  date_from: z
    .string()
    .optional()
    .describe("ISO date string, inclusive lower bound on created_at"),
  date_to: z
    .string()
    .optional()
    .describe("ISO date string, inclusive upper bound on created_at"),
  financial_status: z
    .string()
    .optional()
    .describe("Filter by financial status (e.g. 'PAID', 'PENDING', 'REFUNDED')"),
  fulfillment_status: z
    .string()
    .optional()
    .describe("Filter by fulfillment status (e.g. 'FULFILLED', 'UNFULFILLED', 'PARTIAL')"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Max rows to return (1-100, default 25)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of rows to skip"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const ordersSearch: ToolDef = {
  name: "slam_orders_search",
  description:
    "Search orders by customer email or name fragment, date range, or status. Use for support workflows like 'find all orders from jane@example.com' or 'show unfulfilled orders from last week'.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.query) {
      where.push("(o.email LIKE ('%' || ? || '%') OR o.name LIKE ('%' || ? || '%'))");
      filterBindings.push(params.query, params.query);
    }
    if (params.date_from) {
      where.push("o.created_at >= ?");
      filterBindings.push(params.date_from);
    }
    if (params.date_to) {
      where.push("o.created_at <= ?");
      filterBindings.push(params.date_to);
    }
    if (params.financial_status) {
      where.push("o.financial_status = ?");
      filterBindings.push(params.financial_status);
    }
    if (params.fulfillment_status) {
      where.push("o.fulfillment_status = ?");
      filterBindings.push(params.fulfillment_status);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        o.id, o.name, o.email, o.financial_status, o.fulfillment_status,
        o.total_price, o.subtotal_price,
        o.created_at, o.updated_at
      FROM orders o
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countSql = `SELECT COUNT(*) AS cnt FROM orders o ${whereClause}`;
    const countRow = db.prepare(countSql).get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "orders",
        output_type: "search",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
      },
      orders: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
