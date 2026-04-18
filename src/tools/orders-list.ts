/**
 * slam_orders_list — paginated orders with customer name and line item count.
 *
 * Gadget schema: orders has customer_id FK in addition to email.
 * Join to order_line_items (Gadget table name).
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const SORT_COLUMNS = ["name", "total_price", "financial_status", "fulfillment_status", "created_at", "updated_at"] as const;

const schema = {
  financial_status: z.string().optional().describe("Filter by financial status (e.g. 'PAID', 'PENDING', 'REFUNDED')"),
  fulfillment_status: z.string().optional().describe("Filter by fulfillment status (e.g. 'FULFILLED', 'UNFULFILLED')"),
  limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return (1-100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
  sort_by: z.enum(SORT_COLUMNS).default("created_at").describe("Column to sort by"),
  sort_order: z.enum(["ASC", "DESC"]).default("DESC").describe("Sort direction"),
} as const;
type Params = z.infer<z.ZodObject<typeof schema>>;

export const ordersList: ToolDef = {
  name: "slam_orders_list",
  description:
    "Returns a paginated list of orders with customer name and line item count. Filterable by financial_status and fulfillment_status.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.financial_status) {
      where.push("o.financial_status = ?");
      filterBindings.push(params.financial_status);
    }
    if (params.fulfillment_status) {
      where.push("o.fulfillment_status = ?");
      filterBindings.push(params.fulfillment_status);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sortCol = SORT_COLUMNS.includes(params.sort_by) ? params.sort_by : "created_at";
    const sortDir = params.sort_order === "DESC" ? "DESC" : "ASC";

    // Map of column names that need CAST for correct numeric ordering
    const SORT_EXPR: Record<string, string> = {
      total_price: "CAST(o.total_price AS REAL)",
    };
    const sortExpr = SORT_EXPR[sortCol] ?? `o.${sortCol}`;

    const sql = `
      SELECT
        o.id, o.name, o.email, o.total_price, o.subtotal_price,
        o.financial_status, o.fulfillment_status,
        o.created_at, o.updated_at,
        c.first_name || ' ' || c.last_name AS customer_name,
        COUNT(li.id) AS line_item_count
      FROM orders o
      LEFT JOIN customers c ON c.email = o.email
      LEFT JOIN order_line_items li ON li.order_id = o.id
      ${whereClause}
      GROUP BY o.id
      ORDER BY ${sortExpr} ${sortDir}
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countSql = `SELECT COUNT(*) AS cnt FROM orders o ${whereClause}`;
    const countRow = db.prepare(countSql).get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "orders",
        output_type: "list",
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
