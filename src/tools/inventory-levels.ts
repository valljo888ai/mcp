/**
 * slam_inventory_levels — inventory levels joined with variant info.
 *
 * Gadget variant: adds location_name via LEFT JOIN on locations.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const schema = {
  product_id: z.string().optional().describe("Filter by product ID (Shopify GID)"),
  sku: z.string().optional().describe("Filter by SKU"),
  location_id: z.string().optional().describe("Filter by location ID"),
  limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return (1-100, default 25)"),
  offset: z.number().int().min(0).default(0).describe("Number of rows to skip"),
} as const;

type Params = z.infer<z.ZodObject<typeof schema>>;

export const inventoryLevels: ToolDef = {
  name: "slam_inventory_levels",
  description:
    "Returns inventory levels joined with variant info (SKU, title) and location name. Filterable by product_id, SKU, or location_id.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const filterBindings: unknown[] = [];

    if (params.product_id) {
      where.push("v.product_id = ?");
      filterBindings.push(params.product_id);
    }
    if (params.sku) {
      where.push("ii.sku = ?");
      filterBindings.push(params.sku);
    }
    if (params.location_id) {
      where.push("il.location_id = ?");
      filterBindings.push(params.location_id);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        il.inventory_item_id,
        il.location_id,
        l.name AS location_name,
        il.available,
        ii.sku,
        ii.cost,
        ii.tracked,
        v.id AS variant_id,
        v.title AS variant_title,
        v.product_id
      FROM inventory_levels il
      JOIN inventory_items ii ON ii.id = il.inventory_item_id
      LEFT JOIN variants v ON v.sku = ii.sku AND ii.sku IS NOT NULL
      LEFT JOIN locations l ON l.id = il.location_id
      ${whereClause}
      ORDER BY ii.sku ASC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(...filterBindings, params.limit, params.offset) as Record<string, unknown>[];

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM inventory_levels il
      JOIN inventory_items ii ON ii.id = il.inventory_item_id
      LEFT JOIN variants v ON v.sku = ii.sku AND ii.sku IS NOT NULL
      ${whereClause}
    `;
    const countRow = db.prepare(countSql).get(...filterBindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "inventory",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
      },
      inventory_levels: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
