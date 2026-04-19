/**
 * Conformance tests — structural invariants that every tool must satisfy.
 *
 * These tests catch entire bug classes automatically:
 *   - _meta.returned missing (caught all 6 conditions tools + sales-summary + store-snapshot)
 *   - _meta.total_count missing on paginated tools (caught 8+ tools)
 *   - freshness_tier value not in the valid set
 *
 * One test per tool. Tests assert shape, not data — they pass with empty results.
 * Any tool that ships without following the _meta contract fails CI immediately.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, type TestHarness } from "../helpers.js";

// ---------------------------------------------------------------------------
// Fixture IDs (from e2e/fixture/store.db)
// ---------------------------------------------------------------------------
const FIX = {
  product_id:    "prod_1",
  variant_id:    "var_1",
  customer_id:   "cust_1",
  order_id:      "ord_1",
  collection_id: "coll_1",
};

// ---------------------------------------------------------------------------
// Tool registry — every tool with its minimum valid params
// ---------------------------------------------------------------------------
type ToolEntry = [
  name: string,
  args: Record<string, unknown>,
  opts?: { paginated?: boolean },
];

const TOOLS: ToolEntry[] = [
  // --- Conditions (no params) -----------------------------------------------
  ["slam_conditions_content",     {}, { paginated: false }],
  ["slam_conditions_customers",   {}, { paginated: false }],
  ["slam_conditions_identifiers", {}, { paginated: false }],
  ["slam_conditions_inventory",   {}, { paginated: false }],
  ["slam_conditions_orders",      {}, { paginated: false }],
  ["slam_conditions_pricing",     {}, { paginated: false }],

  // --- Meta / health (no params) --------------------------------------------
  ["slam_health",        {}, { paginated: false }],
  ["slam_meta_schema",   {}, { paginated: false }],
  ["slam_meta_status",   {}, { paginated: false }],
  ["slam_meta_store",    {}, { paginated: false }],
  ["slam_store_snapshot",{}, { paginated: false }],

  // --- Products -------------------------------------------------------------
  ["slam_products_list",   { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_products_search", { query: "test", limit: 25, offset: 0 }, { paginated: true }],
  ["slam_products_get",    { id: FIX.product_id }, { paginated: false }],
  ["slam_products_count",  {}, { paginated: false }],
  ["slam_products_top",    { limit: 10, offset: 0 }, { paginated: true }],
  ["slam_products_bought_together", { min_co_orders: 1, limit: 10 }, { paginated: true }],

  // --- Variants -------------------------------------------------------------
  ["slam_variants_list",   { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_variants_search", { sku: "test-sku", limit: 25, offset: 0 }, { paginated: true }],
  ["slam_variants_get",    { id: FIX.variant_id }, { paginated: false }],
  ["slam_variant_options", { product_id: FIX.product_id }, { paginated: false }],
  ["slam_product_images",  { limit: 25, offset: 0 }, { paginated: true }],

  // --- Collections ----------------------------------------------------------
  ["slam_collections_list",        { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_collections_get",         { id: FIX.collection_id }, { paginated: false }],
  ["slam_collections_for_product", { product_id: FIX.product_id }, { paginated: false }],
  ["slam_products_for_collection", { collection_id: FIX.collection_id, limit: 25, offset: 0 }, { paginated: true }],

  // --- Customers ------------------------------------------------------------
  ["slam_customers_list",    { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_customers_search",  { query: "test", limit: 25, offset: 0 }, { paginated: true }],
  ["slam_customers_get",     { id: FIX.customer_id }, { paginated: false }],
  ["slam_customers_top",     { limit: 10, offset: 0 }, { paginated: true }],
  ["slam_customers_by_tag",  { limit: 50, offset: 0 }, { paginated: true }],
  ["slam_customer_addresses",{ limit: 25, offset: 0 }, { paginated: true }],

  // --- Orders ---------------------------------------------------------------
  ["slam_orders_list",            { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_orders_search",          { query: "test", limit: 25, offset: 0 }, { paginated: true }],
  ["slam_orders_get",             { id: FIX.order_id }, { paginated: false }],
  ["slam_order_line_items_list",  { order_id: FIX.order_id, limit: 25, offset: 0 }, { paginated: true }],
  ["slam_draft_orders_list",      { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_sales_summary",          {}, { paginated: false }],
  ["slam_sales_by_period",        { period: "month", limit: 12 }, { paginated: false }],

  // --- Discounts ------------------------------------------------------------
  ["slam_discounts_active",  { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_discounts_summary", { limit: 25, offset: 0 }, { paginated: true }],

  // --- Inventory ------------------------------------------------------------
  ["slam_inventory_summary",     {}, { paginated: false }],
  ["slam_inventory_alerts",      { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_inventory_levels",      { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_inventory_oversold",    { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_inventory_by_location", {}, { paginated: false }],
  ["slam_locations_list",        {}, { paginated: false }],
  ["slam_dead_stock",            { limit: 25, offset: 0 }, { paginated: true }],

  // --- Fulfillment / returns / refunds --------------------------------------
  ["slam_fulfillment_tracking", { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_returns_summary",      { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_refunds_summary",      { limit: 25, offset: 0 }, { paginated: true }],

  // --- Pricing --------------------------------------------------------------
  ["slam_prices_current", { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_price_analysis", { limit: 25, offset: 0 }, { paginated: true }],

  // --- Selling plans / B2B / gift cards -------------------------------------
  ["slam_selling_plans_list", { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_b2b_companies_list", { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_gift_cards_summary", {}, { paginated: false }],

  // --- Content --------------------------------------------------------------
  ["slam_content_pages",  { limit: 25, offset: 0 }, { paginated: true }],
  ["slam_vendors_summary",{}, { paginated: false }],

  // --- Raw query / metafields -----------------------------------------------
  ["slam_run_query",        { sql: "SELECT 1 AS n", limit: 10 }, { paginated: false }],
  ["slam_metafields_query", { owner_type: "PRODUCT", limit: 10, offset: 0 }, { paginated: true }],
];

// ---------------------------------------------------------------------------
// Invariant 1: _meta.returned is always a number
// ---------------------------------------------------------------------------
describe("conformance: _meta.returned is always a number", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  for (const [toolName, args] of TOOLS) {
    it(toolName, async () => {
      const data = parseResult(
        await h.client.callTool({ name: toolName, arguments: args }),
      );
      const meta = data["_meta"] as Record<string, unknown> | undefined;
      // All tools must have _meta
      expect(meta, `${toolName}: _meta must be present`).toBeDefined();
      // _meta.returned must be a number on every tool
      expect(
        typeof meta!["returned"],
        `${toolName}: _meta.returned must be a number`,
      ).toBe("number");
    });
  }
});

// ---------------------------------------------------------------------------
// Invariant 2: paginated tools expose total_count, has_more, and offset
// ---------------------------------------------------------------------------
describe("conformance: paginated tools have total_count, has_more, offset", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  for (const [toolName, args, opts] of TOOLS) {
    if (!opts?.paginated) continue;
    it(toolName, async () => {
      const data = parseResult(
        await h.client.callTool({ name: toolName, arguments: args }),
      );
      const meta = data["_meta"] as Record<string, unknown>;
      expect(
        typeof meta["total_count"],
        `${toolName}: _meta.total_count must be a number`,
      ).toBe("number");
      expect(
        typeof meta["has_more"],
        `${toolName}: _meta.has_more must be a boolean`,
      ).toBe("boolean");
      expect(
        typeof meta["offset"],
        `${toolName}: _meta.offset must be a number`,
      ).toBe("number");
    });
  }
});

// ---------------------------------------------------------------------------
// Invariant 3: freshness_tier is always a valid value when present
// ---------------------------------------------------------------------------
describe("conformance: freshness_tier is always valid", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  const VALID_TIERS = new Set([
    "fresh",
    "stale",
    "very_stale",
    "outdated",
    "unknown",
  ]);

  for (const [toolName, args] of TOOLS) {
    it(toolName, async () => {
      const data = parseResult(
        await h.client.callTool({ name: toolName, arguments: args }),
      );
      const meta = data["_meta"] as Record<string, unknown> | undefined;
      if (!meta || !("freshness_tier" in meta)) return;
      expect(
        VALID_TIERS.has(meta["freshness_tier"] as string),
        `${toolName}: freshness_tier "${String(meta["freshness_tier"])}" is not a valid tier`,
      ).toBe(true);
    });
  }
});
