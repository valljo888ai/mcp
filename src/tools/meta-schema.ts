/**
 * slam_meta_schema — table/column documentation from the database.
 *
 * Returns the physical schema (tables + columns), logical relationships,
 * TEMP view documentation (with semantic descriptions), and copy-paste
 * SQL patterns for common cross-table queries.
 */

import { getDb } from "../lib/db.js";
import { getFreshness } from "../lib/freshness.js";
import { wrapHandler, type ToolDef } from "./index.js";

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface TableEntry {
  name: string;
  type: string;
}

// ---------------------------------------------------------------------------
// TEMP view documentation — semantic descriptions for LLM consumption.
// PRAGMA table_info() returns column names but blank types for computed columns;
// this fills the gap so an LLM can write correct queries without guessing.
// ---------------------------------------------------------------------------

const VIEW_DOCUMENTATION: Record<
  string,
  { purpose: string; columns: Record<string, string>; usage_hint: string }
> = {
  product_sales: {
    purpose:
      "Products joined with order line_items — aggregated sales metrics per product. Only products with at least one order appear.",
    columns: {
      product_id: "Shopify GID (TEXT) — matches products.id",
      product_title: "Product title at time of sync",
      vendor: "Product vendor — use for vendor-level grouping",
      product_type: "Product type tag",
      order_count: "Number of distinct orders containing this product (INTEGER)",
      units_sold: "Total quantity sold across all orders (INTEGER)",
      total_revenue:
        "SUM(price * quantity) cast to REAL — source prices are TEXT in line_items. Use COALESCE(CAST(total_revenue AS REAL), 0) in arithmetic.",
    },
    usage_hint:
      "ORDER BY total_revenue DESC for best sellers. JOIN to products on product_id for status/tags. Products with zero sales do NOT appear — left-join artifact.",
  },
  variant_stock_health: {
    purpose:
      "Variant stock aggregated across ALL inventory locations. More accurate than variants.inventory_quantity which is a single-location denorm field.",
    columns: {
      variant_id: "Shopify GID (TEXT) — matches variants.id",
      product_id: "Parent product GID — join to products.id",
      variant_title: "Variant title (e.g. 'Small / Red')",
      sku: "SKU string, may be null",
      inventory_quantity:
        "Deprecated single-location count from variants table — prefer total_available",
      total_available: "Sum of available across all locations (INTEGER)",
      total_on_hand: "Sum of on_hand across all locations (INTEGER)",
      total_reserved: "Sum of reserved across all locations (INTEGER)",
    },
    usage_hint:
      "WHERE total_available = 0 for out-of-stock. WHERE total_available <= 5 for low stock. JOIN to products on product_id for product title/vendor.",
  },
  price_comparison: {
    purpose:
      "Variants with compare_at_price discount analysis. Every variant appears; discount_percentage is 0 when no compare_at_price is set.",
    columns: {
      variant_id: "Shopify GID (TEXT) — matches variants.id",
      product_id: "Parent product GID",
      product_title: "Product title",
      variant_title: "Variant title",
      price: "Current selling price (TEXT — CAST to REAL for arithmetic)",
      compare_at_price:
        "Original/was price shown crossed-out (TEXT, nullable)",
      discount_percentage:
        "Computed: (compare_at - price) / compare_at * 100, rounded to 2dp (REAL). 0 when no compare_at.",
    },
    usage_hint:
      "WHERE discount_percentage > 0 for items on sale. ORDER BY discount_percentage DESC for biggest discounts.",
  },
  product_collection_map: {
    purpose:
      "Many-to-many relationship between products and collections — denormalized join of collection_memberships with titles on both sides.",
    columns: {
      product_id: "Shopify GID (TEXT)",
      product_title: "Product title",
      collection_id: "Shopify GID (TEXT)",
      collection_title: "Collection title",
      collection_handle: "Collection URL handle",
    },
    usage_hint:
      "WHERE collection_id = ? to list products in a collection. WHERE product_id = ? to list collections for a product. Faster than joining collection_memberships manually.",
  },
  inventory_by_location: {
    purpose:
      "Inventory levels aggregated by location. Answers which warehouse has what stock.",
    columns: {
      location_id: "Shopify location GID (TEXT)",
      item_count:
        "Number of distinct inventory items tracked at this location (INTEGER)",
      total_available: "Sum of available units at this location (INTEGER)",
      total_on_hand: "Sum of on_hand units (INTEGER)",
      total_reserved: "Sum of reserved units (INTEGER)",
      total_committed: "Sum of committed units (INTEGER)",
    },
    usage_hint:
      "ORDER BY total_available DESC to see best-stocked location. JOIN to inventory_levels on location_id for item-level detail.",
  },
};

// ---------------------------------------------------------------------------
// Copy-paste SQL patterns for the most common cross-table queries.
// These compensate for schema quirks an LLM might not infer from PRAGMA alone.
// ---------------------------------------------------------------------------

const QUERY_TIPS = [
  {
    label: "orders joined to customers",
    note: "No FK declared — join on email, not customer_id",
    example:
      "SELECT o.name, o.total_price, c.first_name, c.last_name FROM orders o LEFT JOIN customers c ON c.email = o.email",
  },
  {
    label: "money fields require CAST",
    note: "Shopify stores prices as TEXT. Always CAST before arithmetic or comparison.",
    example:
      "SELECT SUM(CAST(total_price AS REAL)) AS revenue FROM orders WHERE financial_status = 'PAID'",
  },
  {
    label: "best selling products",
    example:
      "SELECT product_id, product_title, units_sold, COALESCE(CAST(total_revenue AS REAL), 0) AS rev FROM product_sales ORDER BY rev DESC LIMIT 10",
  },
  {
    label: "low stock variants (multi-location accurate)",
    example:
      "SELECT variant_id, product_id, sku, total_available FROM variant_stock_health WHERE total_available <= 5 ORDER BY total_available ASC",
  },
  {
    label: "products on sale (with discount percentage)",
    example:
      "SELECT product_title, variant_title, price, compare_at_price, discount_percentage FROM price_comparison WHERE discount_percentage > 0 ORDER BY discount_percentage DESC",
  },
  {
    label: "revenue by month",
    example:
      "SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS orders, SUM(CAST(total_price AS REAL)) AS revenue FROM orders GROUP BY month ORDER BY month DESC LIMIT 12",
  },
  {
    label: "products in a collection",
    example:
      "SELECT product_id, product_title FROM product_collection_map WHERE collection_id = ?",
  },
  {
    label: "orders with line item detail",
    example:
      "SELECT o.name, o.total_price, li.title, li.quantity, li.price FROM orders o JOIN line_items li ON li.order_id = o.id WHERE o.id = ?",
  },
];

// Logical relationships — SQLite has no declared FKs; these are the known join paths.
const KNOWN_RELATIONSHIPS = [
  { from_table: "variants",               from_col: "product_id",        to_table: "products",        to_col: "id" },
  { from_table: "line_items",             from_col: "order_id",          to_table: "orders",          to_col: "id" },
  { from_table: "line_items",             from_col: "product_id",        to_table: "products",        to_col: "id" },
  { from_table: "line_items",             from_col: "variant_id",        to_table: "variants",        to_col: "id" },
  { from_table: "inventory_levels",       from_col: "inventory_item_id", to_table: "inventory_items", to_col: "id" },
  { from_table: "inventory_items",        from_col: "variant_id",        to_table: "variants",        to_col: "id" },
  { from_table: "collection_memberships", from_col: "product_id",        to_table: "products",        to_col: "id" },
  { from_table: "collection_memberships", from_col: "collection_id",     to_table: "collections",     to_col: "id" },
  { from_table: "orders",                 from_col: "email",             to_table: "customers",       to_col: "email", note: "logical join — no FK declared" },
] as const;

export const metaSchema: ToolDef = {
  name: "slam_meta_schema",
  description:
    "Returns the full database schema (tables + columns), logical relationships, TEMP view documentation with semantic descriptions and column type notes, and copy-paste SQL patterns for common cross-table queries. Call this before writing slam_run_query to understand the data model.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const freshness = getFreshness(db);

    // Physical tables and permanent views
    const tables = db
      .prepare(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name",
      )
      .all() as TableEntry[];

    // TEMP views (created at connection open, not persisted in .db file)
    const tempViews = db
      .prepare(
        "SELECT name, type FROM sqlite_temp_master WHERE type = 'view' ORDER BY name",
      )
      .all() as TableEntry[];

    const schema: Record<
      string,
      { type: string; columns: { name: string; type: string; nullable: boolean; pk: boolean }[] }
    > = {};

    for (const table of [...tables, ...tempViews]) {
      const safeName = table.name.replace(/"/g, '""');
      const columns = db
        .prepare(`PRAGMA table_info("${safeName}")`)
        .all() as ColumnInfo[];

      schema[table.name] = {
        type: table.type,
        columns: columns.map((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.notnull === 0,
          pk: c.pk === 1,
        })),
      };
    }

    const result = {
      _meta: {
        domain: "meta",
        output_type: "detail",
        last_sync_at: freshness.last_sync_at,
        minutes_since_sync: freshness.minutes_since_sync,
        freshness_tier: freshness.freshness_tier,
        returned: Object.keys(schema).length,
        offset: 0,
        has_more: false,
      },
      schema,
      relationships: KNOWN_RELATIONSHIPS,
      view_documentation: VIEW_DOCUMENTATION,
      query_tips: QUERY_TIPS,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }),
};
