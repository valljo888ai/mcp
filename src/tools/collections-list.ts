/**
 * slam_collections_list — paginated collections with product counts.
 *
 * collection_type is derived: collections with non-null `rules` are "smart",
 * otherwise "custom". The actual schema has no explicit collection_type column.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const SORT_COLUMNS = ["title", "handle"] as const;

const schema = {
  collection_type: z
    .enum(["smart", "custom"])
    .optional()
    .describe("Filter by collection type: 'smart' (has rules) or 'custom' (no rules)"),
  limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return (1-100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
  sort_by: z.enum(SORT_COLUMNS).default("title").describe("Column to sort by"),
  sort_order: z.enum(["ASC", "DESC"]).default("ASC").describe("Sort direction"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const collectionsList: ToolDef = {
  name: "slam_collections_list",
  description:
    "Returns a paginated list of collections with product counts. Filterable by collection_type ('smart' or 'custom').",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.collection_type === "smart") {
      where.push("c.rules IS NOT NULL");
    } else if (params.collection_type === "custom") {
      where.push("c.rules IS NULL");
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sortCol = SORT_COLUMNS.includes(params.sort_by) ? params.sort_by : "title";
    const sortDir = params.sort_order === "DESC" ? "DESC" : "ASC";

    const sql = `
      SELECT
        c.id, c.title, c.handle, c.sort_order, c.rules,
        CASE WHEN c.rules IS NOT NULL THEN 'smart' ELSE 'custom' END AS collection_type,
        COUNT(cm.product_id) AS product_count
      FROM collections c
      LEFT JOIN collection_memberships cm ON cm.collection_id = c.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.${sortCol} ${sortDir}
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countSql = `SELECT COUNT(*) AS cnt FROM collections c ${whereClause}`;
    const countRow = db.prepare(countSql).get(...filterBindings) as { cnt: number } | undefined;
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
      },
      collections: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
