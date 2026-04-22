/**
 * slam_metafields_query — browse and filter metafields across entities.
 *
 * Surfaces custom fields attached to products, variants, customers, orders,
 * and collections. Supports filtering by owner type, namespace, key, owner ID,
 * and a LIKE search on value.
 */

import { z } from "zod";
import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

const OWNER_TYPES = [
  "PRODUCT",
  "PRODUCTVARIANT",
  "CUSTOMER",
  "ORDER",
  "COLLECTION",
] as const;

const STORED_OWNER_TYPE: Record<string, string> = {
  PRODUCT: "product",
  PRODUCTVARIANT: "variant",
  CUSTOMER: "customer",
  ORDER: "order",
  COLLECTION: "collection",
};

const schema = {
  owner_type: z
    .enum(OWNER_TYPES)
    .optional()
    .describe(
      "Filter to metafields owned by this entity type (PRODUCT, PRODUCTVARIANT, CUSTOMER, ORDER, COLLECTION)",
    ),
  namespace: z
    .string()
    .optional()
    .describe("Exact-match filter on namespace (e.g. 'custom', 'shopify')"),
  key: z
    .string()
    .optional()
    .describe("Exact-match filter on key (e.g. 'material', 'care_guide')"),
  owner_id: z
    .string()
    .optional()
    .describe("Return all metafields for this specific entity (Shopify GID)"),
  value_contains: z
    .string()
    .optional()
    .describe("LIKE filter on value — returns metafields whose value contains this string"),
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

export const metafieldsQuery: ToolDef = {
  name: "slam_metafields_query",
  description:
    "Browse and filter metafields (custom fields) across products, variants, customers, " +
    "orders, and collections. Filter by owner type, namespace, key, a specific entity ID, " +
    "or a substring of the value. Returns owner label (product title, customer email, " +
    "or variant title) alongside each metafield.",
  schema,
  handler: wrapHandler(async (raw) => {
    const params = raw as Params;
    const { db } = getDb();
    const freshness = getFreshness(db);

    const where: string[] = [];
    const bindings: unknown[] = [];

    if (params.owner_type) {
      where.push("LOWER(mf.owner_type) = ?");
      bindings.push(STORED_OWNER_TYPE[params.owner_type] ?? params.owner_type.toLowerCase());
    }
    if (params.namespace) {
      where.push("mf.namespace = ?");
      bindings.push(params.namespace);
    }
    if (params.key) {
      where.push("mf.key = ?");
      bindings.push(params.key);
    }
    if (params.owner_id) {
      where.push("mf.owner_id = ?");
      bindings.push(params.owner_id);
    }
    if (params.value_contains) {
      where.push("mf.value LIKE ?");
      bindings.push(`%${params.value_contains}%`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        mf.id, mf.owner_id, mf.owner_type, mf.namespace, mf.key, mf.value, mf.type,
        CASE
          WHEN LOWER(mf.owner_type) = 'product'                      THEN p.title
          WHEN LOWER(mf.owner_type) = 'customer'                     THEN c.email
          WHEN LOWER(mf.owner_type) IN ('variant', 'productvariant') THEN v.title
          ELSE NULL
        END AS owner_label
      FROM metafields mf
      LEFT JOIN products  p ON LOWER(mf.owner_type) = 'product'                      AND p.id = mf.owner_id
      LEFT JOIN customers c ON LOWER(mf.owner_type) = 'customer'                     AND c.id = mf.owner_id
      LEFT JOIN variants  v ON LOWER(mf.owner_type) IN ('variant', 'productvariant') AND v.id = mf.owner_id
      ${whereClause}
      ORDER BY mf.owner_type, mf.namespace, mf.key
      LIMIT ? OFFSET ?
    `;

    const rows = db
      .prepare(sql)
      .all(...bindings, params.limit, params.offset) as Record<string, unknown>[];

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM metafields mf
      ${whereClause}
    `;
    const countRow = db.prepare(countSql).get(...bindings) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const result = {
      _meta: {
        domain: "meta",
        output_type: "list",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: rows.length,
        offset: params.offset,
        has_more: params.offset + rows.length < total,
        total_count: total,
      },
      metafields: rows,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
