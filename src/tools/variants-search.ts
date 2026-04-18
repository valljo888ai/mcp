/**
 * slam_variants_search — look up variants by exact SKU or barcode.
 *
 * Returns variant details plus parent product info. At least one of
 * sku or barcode must be provided.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  sku: z
    .string()
    .optional()
    .describe("Exact SKU to look up"),
  barcode: z
    .string()
    .optional()
    .describe("Exact barcode to look up"),
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

export const variantsSearch: ToolDef = {
  name: "slam_variants_search",
  description:
    "Look up variants by exact SKU or barcode. Returns variant details plus parent product info. Provide sku, barcode, or both.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;

    if (!params.sku && !params.barcode) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: "Provide at least one of: sku, barcode",
              _meta: { domain: "error" },
            }),
          },
        ],
      };
    }

    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.sku && params.barcode) {
      where.push("(v.sku = ? OR v.barcode = ?)");
      filterBindings.push(params.sku, params.barcode);
    } else if (params.sku) {
      where.push("v.sku = ?");
      filterBindings.push(params.sku);
    } else if (params.barcode) {
      where.push("v.barcode = ?");
      filterBindings.push(params.barcode);
    }

    const whereClause = `WHERE ${where.join(" AND ")}`;

    const sql = `
      SELECT
        v.id, v.product_id, v.title, v.sku, v.barcode,
        v.price, v.compare_at_price, v.inventory_quantity, v.position,
        p.title AS product_title, p.status AS product_status,
        p.vendor, p.handle AS product_handle
      FROM variants v
      JOIN products p ON p.id = v.product_id
      ${whereClause}
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM variants v
      JOIN products p ON p.id = v.product_id
      ${whereClause}
    `;
    const countRow = db.prepare(countSql).get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "variants",
        output_type: "search",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
      },
      variants: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
