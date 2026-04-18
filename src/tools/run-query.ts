/**
 * slam_run_query — raw SQL with full middleware pipeline.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { executeQuery, MAX_LIMIT } from "../lib/query-middleware.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  sql: z.string().min(1).describe("The SQL query to execute (SELECT/PRAGMA/EXPLAIN/WITH only)"),
  params: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
    .describe("Positional parameters for the query (use ? placeholders in SQL)"),
  limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return if query has no LIMIT (1-100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Offset for pagination if query has no LIMIT"),
} as const;
type Params = z.infer<z.ZodObject<typeof schema>>;

export const runQuery: ToolDef = {
  name: "slam_run_query",
  description:
    "Executes a read-only SQL query against the SLAM database with validation, pagination, money column warnings, and fuzzy error suggestions. Only SELECT, PRAGMA, EXPLAIN, and WITH statements are allowed.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const fetchLimit = params.limit + 1;

    const queryResult = executeQuery(
      db,
      params.sql,
      params.params,
      fetchLimit,
      params.offset,
    );

    if ("error" in queryResult) {
      const result = {
        _meta: {
          domain: "query",
          output_type: "list",
          last_sync_at: freshness.last_sync_at,
          minutes_since_sync: freshness.minutes_since_sync,
          freshness_tier: freshness.freshness_tier,
          returned: 0,
          offset: params.offset,
          has_more: false,
        },
        error: queryResult.error,
        suggestions: queryResult.suggestions,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }

    // +1 probe: accurate when params.limit < MAX_LIMIT.
    // When params.limit >= MAX_LIMIT the probe row gets clamped away — conservatively
    // treat a full ceiling page as has_more=true (one extra empty request is harmless).
    const hasMore =
      queryResult.rows.length > params.limit ||
      (params.limit >= MAX_LIMIT && queryResult.rows.length === MAX_LIMIT);
    const rows = queryResult.rows.slice(0, params.limit);

    const result = {
      _meta: {
        domain: "query",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: hasMore,
      },
      rows,
      warnings: queryResult.warnings.length > 0 ? queryResult.warnings : undefined,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
