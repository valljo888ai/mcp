/**
 * Conformance tests — structural invariants that every tool must satisfy.
 *
 * Tools are discovered automatically via listTools() at test startup.
 * No manual list to maintain — new tools are tested the moment they're registered.
 *
 * PARAM_OVERRIDES: only tools with required non-defaulted parameters need an entry.
 * Tools not listed here are called with {} (their schemas have defaults for limit/offset/etc).
 * If a new tool has required params not in PARAM_OVERRIDES, it will fail with a Zod
 * validation error — surfacing the gap immediately rather than silently skipping.
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
// Param overrides — ONLY for tools with required non-defaulted parameters.
// Tools not listed here are called with {}.
// ---------------------------------------------------------------------------
const PARAM_OVERRIDES: Record<string, Record<string, unknown>> = {
  slam_products_get:            { id: FIX.product_id },
  slam_variants_get:            { id: FIX.variant_id },
  slam_customers_get:           { id: FIX.customer_id },
  slam_orders_get:              { id: FIX.order_id },
  slam_collections_get:         { id: FIX.collection_id },
  slam_collections_for_product: { product_id: FIX.product_id },
  slam_products_for_collection: { collection_id: FIX.collection_id },
  slam_variant_options:         { product_id: FIX.product_id },
  slam_order_line_items_list:   { order_id: FIX.order_id },
  slam_metafields_query:        { owner_type: "PRODUCT" },
  slam_products_search:         { query: "test" },
  slam_customers_search:        { query: "test" },
  slam_orders_search:           { query: "test" },
  slam_variants_search:         { sku: "test-sku" },
  slam_run_query:               { sql: "SELECT 1 AS n" },
};

// ---------------------------------------------------------------------------
// Paginated tools — these must have total_count, has_more, offset in _meta.
// Keep this list maintained alongside PARAM_OVERRIDES.
// ---------------------------------------------------------------------------
const PAGINATED_TOOLS = new Set([
  "slam_products_list", "slam_products_search", "slam_products_top",
  "slam_products_bought_together", "slam_products_for_collection",
  "slam_variants_list", "slam_variants_search", "slam_product_images",
  "slam_collections_list",
  "slam_customers_list", "slam_customers_search", "slam_customers_top",
  "slam_customers_by_tag", "slam_customer_addresses",
  "slam_orders_list", "slam_orders_search", "slam_order_line_items_list",
  "slam_draft_orders_list",
  "slam_discounts_active", "slam_discounts_summary",
  "slam_inventory_alerts", "slam_inventory_levels", "slam_inventory_oversold",
  "slam_dead_stock",
  "slam_fulfillment_tracking", "slam_returns_summary", "slam_refunds_summary",
  "slam_prices_current", "slam_price_analysis",
  "slam_selling_plans_list", "slam_b2b_companies_list",
  "slam_content_pages",
  "slam_metafields_query",
]);

// ---------------------------------------------------------------------------
// Discovery — populated in beforeAll, shared across describe blocks
// ---------------------------------------------------------------------------
let discoveredTools: string[] = [];

async function discoverTools(h: TestHarness): Promise<string[]> {
  const result = await h.client.listTools();
  return result.tools.map((t: { name: string }) => t.name).sort();
}

// ---------------------------------------------------------------------------
// Invariant 1: _meta.returned is always a number
// ---------------------------------------------------------------------------
describe("conformance: _meta.returned is always a number", () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestHarness();
    discoveredTools = await discoverTools(h);
  });
  afterAll(async () => { await h.teardown(); });

  it("all discovered tools return _meta.returned as a number", async () => {
    const failures: string[] = [];
    for (const toolName of discoveredTools) {
      const args = PARAM_OVERRIDES[toolName] ?? {};
      try {
        const result = await h.client.callTool({ name: toolName, arguments: args });
        const data = parseResult(result);
        const meta = data["_meta"] as Record<string, unknown> | undefined;
        if (meta === undefined) continue; // tools without _meta (if any)
        if (typeof meta["returned"] !== "number") {
          failures.push(`${toolName}: _meta.returned is ${typeof meta["returned"]}, expected number`);
        }
      } catch (err) {
        failures.push(`${toolName}: threw — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} tool(s) failed:\n${failures.join("\n")}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant 2: paginated tools expose total_count, has_more, and offset
// ---------------------------------------------------------------------------
describe("conformance: paginated tools have total_count, has_more, offset", () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestHarness();
    if (discoveredTools.length === 0) discoveredTools = await discoverTools(h);
  });
  afterAll(async () => { await h.teardown(); });

  it("all paginated tools have complete pagination _meta", async () => {
    const failures: string[] = [];
    for (const toolName of discoveredTools) {
      if (!PAGINATED_TOOLS.has(toolName)) continue;
      const args = PARAM_OVERRIDES[toolName] ?? {};
      try {
        const result = await h.client.callTool({ name: toolName, arguments: args });
        const data = parseResult(result);
        const meta = data["_meta"] as Record<string, unknown>;
        if (typeof meta["total_count"] !== "number")
          failures.push(`${toolName}: total_count missing or not a number`);
        if (typeof meta["has_more"] !== "boolean")
          failures.push(`${toolName}: has_more missing or not a boolean`);
        if (typeof meta["offset"] !== "number")
          failures.push(`${toolName}: offset missing or not a number`);
      } catch (err) {
        failures.push(`${toolName}: threw — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} tool(s) failed:\n${failures.join("\n")}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant 3: freshness_tier is always a valid value when present
// ---------------------------------------------------------------------------
describe("conformance: freshness_tier is always valid", () => {
  let h: TestHarness;
  const VALID_TIERS = new Set(["fresh", "stale", "very_stale", "outdated", "unknown"]);
  beforeAll(async () => {
    h = await createTestHarness();
    if (discoveredTools.length === 0) discoveredTools = await discoverTools(h);
  });
  afterAll(async () => { await h.teardown(); });

  it("all discovered tools return a valid freshness_tier", async () => {
    const failures: string[] = [];
    for (const toolName of discoveredTools) {
      const args = PARAM_OVERRIDES[toolName] ?? {};
      try {
        const result = await h.client.callTool({ name: toolName, arguments: args });
        const data = parseResult(result);
        const meta = data["_meta"] as Record<string, unknown> | undefined;
        if (!meta || !("freshness_tier" in meta)) continue;
        if (!VALID_TIERS.has(meta["freshness_tier"] as string)) {
          failures.push(`${toolName}: freshness_tier "${meta["freshness_tier"]}" is not valid`);
        }
      } catch (err) {
        failures.push(`${toolName}: threw — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} tool(s) failed:\n${failures.join("\n")}`);
    }
  });
});
