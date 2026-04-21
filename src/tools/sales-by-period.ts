/**
 * slam_sales_by_period — time-series sales breakdown by day, week, or month.
 *
 * The most common "how are we doing?" question. Groups orders using SQLite's
 * strftime() function — no external dependencies required.
 *
 * Gadget schema: no changes needed (queries orders table directly, not line_items).
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const PERIOD_FORMATS: Record<string, string> = {
  day:   "%Y-%m-%d",
  week:  "%Y-W%W",
  month: "%Y-%m",
};

const schema = {
  period: z
    .enum(["day", "week", "month"])
    .default("month")
    .describe(
      "Grouping period: 'day' (YYYY-MM-DD), 'week' (YYYY-Www), or 'month' (YYYY-MM). Default: month.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(12)
    .describe("Number of periods to return, most recent first (default 12)"),
  financial_status: z
    .string()
    .optional()
    .describe("Optional: filter to a single financial status (e.g. 'PAID', 'REFUNDED')"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const salesByPeriod: ToolDef = {
  name: "slam_sales_by_period",
  description:
    "Returns orders grouped by day, week, or month — a time-series view of sales performance. Each period includes order_count, total revenue, and average order value. Most recent periods first.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const fmt = PERIOD_FORMATS[params.period] ?? PERIOD_FORMATS.month;
    const filterBindings: unknown[] = [];
    const whereClause = params.financial_status
      ? (filterBindings.push(params.financial_status), "WHERE created_at IS NOT NULL AND financial_status = ?")
      : "WHERE created_at IS NOT NULL";

    const sql = `
      SELECT
        strftime('${fmt}', created_at) AS period_key,
        COUNT(*) AS order_count,
        COALESCE(SUM(CAST(total_price AS REAL)), 0) AS revenue,
        COALESCE(AVG(CAST(total_price AS REAL)), 0) AS avg_order_value
      FROM orders
      ${whereClause}
      GROUP BY period_key
      ORDER BY period_key DESC
      LIMIT ?
    `;

    const rows = db
      .prepare(sql)
      .all(...filterBindings, params.limit) as {
      period_key: string;
      order_count: number;
      revenue: number;
      avg_order_value: number;
    }[];

    const result = {
      _meta: {
        domain: "sales",
        output_type: "time_series",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        period: params.period,
        returned: rows.length,
        money_warning:
          "Revenue values are CAST from TEXT to REAL — floating-point arithmetic applies.",
        ...(params.financial_status
          ? { filtered_to_financial_status: params.financial_status }
          : {}),
      },
      periods: rows.map((r) => ({
        period_key: r.period_key,
        order_count: r.order_count,
        revenue: (r.revenue ?? 0).toFixed(2),
        avg_order_value: (r.avg_order_value ?? 0).toFixed(2),
      })),
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
