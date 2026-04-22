/**
 * slam_customers_search — find customers by email or name fragment.
 *
 * The most basic customer lookup: "find Jane Smith", "look up hello@example.com".
 * Currently impossible without slam_run_query because customers_list has no
 * search/filter parameters.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  query: z
    .string()
    .describe(
      "Search fragment matched against email, first_name, and last_name (case-insensitive LIKE)",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Max rows to return (1–50, default 10)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const customersSearch: ToolDef = {
  name: "slam_customers_search",
  description:
    "Search customers by email address or name fragment. Matches against email, first_name, and last_name using a case-insensitive substring search.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const q = params.query;

    // orders_count and total_spent are not populated by the bulk sync — compute live
    const cte = `
      WITH customer_orders AS (
        SELECT customer_id, COUNT(*) AS order_count
        FROM orders
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      )
    `;

    const rows = db
      .prepare(
        `${cte}
         SELECT
           c.id, c.email, c.first_name, c.last_name, c.phone,
           COALESCE(co.order_count, 0) AS orders_count,
           COALESCE(CAST(c.total_spent AS REAL), 0) AS total_spent
         FROM customers c
         LEFT JOIN customer_orders co ON co.customer_id = c.id
         WHERE
           c.email LIKE '%' || ? || '%'
           OR c.first_name LIKE '%' || ? || '%'
           OR c.last_name LIKE '%' || ? || '%'
         ORDER BY COALESCE(co.order_count, 0) DESC
         LIMIT ? OFFSET ?`,
      )
      .all(q, q, q, params.limit, params.offset) as Record<string, unknown>[];

    const countRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM customers c
         WHERE c.email LIKE '%' || ? || '%'
           OR c.first_name LIKE '%' || ? || '%'
           OR c.last_name LIKE '%' || ? || '%'`,
      )
      .get(q, q, q) as { cnt: number } | undefined;
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
        query: q,
      },
      customers: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
