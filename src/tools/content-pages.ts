/**
 * slam_content_pages — pages and articles for content audit.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

export const contentPages: ToolDef = {
  name: "slam_content_pages",
  description: "Returns pages and articles for content audit. Use content_type filter to restrict to 'page' or 'article'.",
  schema: {
    content_type: z.enum(["page", "article"]).optional().describe("Filter to 'page' or 'article' only"),
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows (default 25)"),
    offset: z.number().int().min(0).default(0).describe("Rows to skip"),
  },
  handler: wrapHandler(async (raw) => {
    const params = raw as { content_type?: "page" | "article"; limit: number; offset: number };
    const { db } = getDb();
    const freshness = getFreshness(db);

    let sql: string;
    if (params.content_type === "page") {
      sql = `SELECT 'page' AS content_type, id, title, handle, published_at, updated_at FROM pages ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    } else if (params.content_type === "article") {
      sql = `SELECT 'article' AS content_type, id, title, handle, published_at, updated_at FROM articles ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    } else {
      sql = `SELECT 'page' AS content_type, id, title, handle, published_at, updated_at FROM pages
             UNION ALL
             SELECT 'article' AS content_type, id, title, handle, published_at, updated_at FROM articles
             ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    }

    const rows = db.prepare(sql).all(params.limit, params.offset) as Record<string, unknown>[];

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          _meta: {
            domain: "content",
            output_type: "list",
            last_sync_at: freshness.last_sync_at,
            minutes_since_sync: freshness.minutes_since_sync,
            freshness_tier: freshness.freshness_tier,
            returned: rows.length,
            offset: params.offset,
          },
          content: rows,
        }, null, 2),
      }],
    };
  }),
};
