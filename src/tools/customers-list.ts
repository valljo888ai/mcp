/**
 * slam_customers_list — paginated customers with orders_count and total_spent.
 *
 * Gadget schema: tag filter uses customer_tags subquery (not c.tags text column).
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const SORT_COLUMNS = ["email", "first_name", "last_name", "orders_count", "total_spent"] as const;

const schema = {
  limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return (1-100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
  sort_by: z.enum(SORT_COLUMNS).default("email").describe("Column to sort by"),
  sort_order: z.enum(["ASC", "DESC"]).default("ASC").describe("Sort direction"),
  tag: z.string().optional().describe("Filter to customers that have this tag"),
} as const;
type Params = z.infer<z.ZodObject<typeof schema>>;

export const customersList: ToolDef = {
  name: "slam_customers_list",
  description:
    "Returns a paginated list of customers with orders_count and total_spent. Optionally filter by tag.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const sortCol = SORT_COLUMNS.includes(params.sort_by) ? params.sort_by : "email";
    const sortDir = params.sort_order === "DESC" ? "DESC" : "ASC";

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.tag) {
      where.push("EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id = c.id AND ct.tag = ?)");
      filterBindings.push(params.tag);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        c.id, c.email, c.first_name, c.last_name, c.phone,
        c.orders_count, c.total_spent, c.state, c.currency
      FROM customers c
      ${whereClause}
      ORDER BY c.${sortCol} ${sortDir}
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM customers c ${whereClause}`)
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
      },
      customers: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
