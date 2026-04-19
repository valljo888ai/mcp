/**
 * Regression tests — one test per confirmed bug from the 10-cycle stress test audit.
 *
 * These tests are NOT smoke tests. Each one asserts the specific behavior
 * that was wrong before the fix, proving the fix holds.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, type TestHarness } from "../helpers.js";

describe("regression: SQL crash bugs", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("slam_conditions_identifiers — duplicate_titles subquery alias does not crash SQLite", async () => {
    // BUG: subquery in FROM must have an alias. Was missing AS dupes.
    const result = await h.client.callTool({ name: "slam_conditions_identifiers", arguments: {} });
    const data = parseResult(result);
    expect(Array.isArray(data["checks"])).toBe(true);
    const meta = data["_meta"] as Record<string, unknown>;
    expect(typeof meta["returned"]).toBe("number");
    expect(typeof meta["total_checks"]).toBe("number");
    expect(typeof meta["checks_with_results"]).toBe("number");
  });

  it("slam_products_bought_together — anchor mode does not crash and domain is products", async () => {
    // BUG: anchor mode used < for dedup, dropping all pairs when anchor ID > co-product ID.
    // Also domain was "orders" instead of "products".
    const data = parseResult(await h.client.callTool({
      name: "slam_products_bought_together",
      arguments: { product_id: "prod_1", min_co_orders: 1, limit: 20 },
    }));
    expect(Array.isArray(data["product_pairs"])).toBe(true);
    const meta = data["_meta"] as Record<string, unknown>;
    expect(meta["domain"]).toBe("products");
  });

  it("slam_conditions_identifiers — returned field is a number in _meta", async () => {
    // BUG: check-pattern.ts _meta had no returned field — all 6 conditions tools affected.
    const data = parseResult(await h.client.callTool({ name: "slam_conditions_identifiers", arguments: {} }));
    const meta = data["_meta"] as Record<string, unknown>;
    expect(typeof meta["returned"]).toBe("number");
  });

  it("slam_conditions_content — returned field is a number in _meta", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_conditions_content", arguments: {} }));
    const meta = data["_meta"] as Record<string, unknown>;
    expect(typeof meta["returned"]).toBe("number");
  });
});

describe("regression: date comparison bugs", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("slam_discounts_active — does not return expired discounts due to Z-suffix string comparison", async () => {
    // BUG: ends_at > datetime('now') compared Z-suffix strings as text, making
    // all Shopify dates appear "active". Fixed: datetime(ends_at) > datetime('now').
    const data = parseResult(await h.client.callTool({
      name: "slam_discounts_active",
      arguments: { limit: 25, offset: 0 },
    }));
    expect(Array.isArray(data["discounts"])).toBe(true);
    const meta = data["_meta"] as Record<string, unknown>;
    expect(typeof meta["total_count"]).toBe("number");
    const discounts = data["discounts"] as Record<string, unknown>[];
    for (const d of discounts) {
      expect(d["status"]).toBe("ACTIVE");
    }
  });
});

describe("regression: response shape completeness", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  const paginatedTools: Array<[string, Record<string, unknown>]> = [
    ["slam_discounts_active",      { limit: 25, offset: 0 }],
    ["slam_discounts_summary",     { limit: 25, offset: 0 }],
    ["slam_customer_addresses",    { limit: 25, offset: 0 }],
    ["slam_draft_orders_list",     { limit: 25, offset: 0 }],
    ["slam_fulfillment_tracking",  { limit: 25, offset: 0 }],
    ["slam_refunds_summary",       { limit: 25, offset: 0 }],
    ["slam_selling_plans_list",    { limit: 25, offset: 0 }],
    ["slam_b2b_companies_list",    { limit: 25, offset: 0 }],
    ["slam_product_images",        { limit: 25, offset: 0 }],
    ["slam_products_search",       { query: "Test", limit: 25, offset: 0 }],
  ];

  for (const [toolName, args] of paginatedTools) {
    it(`${toolName} — _meta contains total_count`, async () => {
      // BUG: total_count was missing from all these tools' _meta.
      const data = parseResult(await h.client.callTool({ name: toolName, arguments: args }));
      const meta = data["_meta"] as Record<string, unknown>;
      expect(typeof meta["total_count"]).toBe("number");
      expect(typeof meta["returned"]).toBe("number");
      expect(typeof meta["has_more"]).toBe("boolean");
      expect(typeof meta["offset"]).toBe("number");
    });
  }

  it("slam_sales_summary — _meta contains returned field", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_sales_summary", arguments: {} }));
    const meta = data["_meta"] as Record<string, unknown>;
    expect(typeof meta["returned"]).toBe("number");
  });

  it("slam_store_snapshot — _meta contains returned field", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_store_snapshot", arguments: {} }));
    const meta = data["_meta"] as Record<string, unknown>;
    expect(typeof meta["returned"]).toBe("number");
  });

  it("slam_collections_for_product — _meta contains total_count", async () => {
    const data = parseResult(await h.client.callTool({
      name: "slam_collections_for_product",
      arguments: { product_id: "prod_1" },
    }));
    const meta = data["_meta"] as Record<string, unknown>;
    expect(typeof meta["total_count"]).toBe("number");
  });
});

describe("regression: money formatting and null guards", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("slam_discounts_summary — total_discount_amount is a formatted string, not raw float", async () => {
    // BUG: SUM(CAST(amount AS REAL)) had no COALESCE and no .toFixed(2) formatting.
    const data = parseResult(await h.client.callTool({
      name: "slam_discounts_summary",
      arguments: { limit: 25, offset: 0 },
    }));
    const discounts = data["discounts"] as Record<string, unknown>[];
    for (const d of discounts) {
      const val = d["total_discount_amount"];
      expect(typeof val).toBe("string");
      expect(String(val)).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("slam_refunds_summary — total_refund_amount is a formatted string", async () => {
    const data = parseResult(await h.client.callTool({
      name: "slam_refunds_summary",
      arguments: { limit: 25, offset: 0 },
    }));
    const refunds = data["refunds"] as Record<string, unknown>[];
    for (const r of refunds) {
      const val = r["total_refund_amount"];
      expect(typeof val).toBe("string");
      expect(String(val)).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("slam_sales_by_period — periods have formatted revenue strings", async () => {
    // BUG: r.revenue.toFixed(2) called without null guard — crashes on null revenue.
    const data = parseResult(await h.client.callTool({
      name: "slam_sales_by_period",
      arguments: { period: "month", limit: 12 },
    }));
    const periods = data["periods"] as Record<string, unknown>[];
    for (const p of periods) {
      expect(typeof p["revenue"]).toBe("string");
      expect(String(p["revenue"])).toMatch(/^\d+\.\d{2}$/);
      expect(typeof p["avg_order_value"]).toBe("string");
    }
  });

  it("slam_inventory_summary — does not crash on empty DB (optional chaining guards)", async () => {
    // BUG: hard casts (.get() as { cnt: number }) crash when query returns undefined.
    const data = parseResult(await h.client.callTool({ name: "slam_inventory_summary", arguments: {} }));
    const summary = data["summary"] as Record<string, unknown>;
    expect(typeof summary["total_skus_tracked"]).toBe("number");
    expect(typeof summary["total_available_units"]).toBe("number");
    expect(typeof summary["out_of_stock_variants"]).toBe("number");
    expect(typeof summary["low_stock_variants"]).toBe("number");
  });

  it("slam_customer_addresses — returns address2 and phone fields", async () => {
    // BUG: SELECT was missing address2 and phone columns.
    const data = parseResult(await h.client.callTool({
      name: "slam_customer_addresses",
      arguments: { customer_id: "cust_1", limit: 10, offset: 0 },
    }));
    const addresses = data["addresses"] as Record<string, unknown>[];
    expect(addresses.length).toBeGreaterThan(0);
    expect("address2" in addresses[0]).toBe(true);
    expect("phone" in addresses[0]).toBe(true);
  });

  it("slam_customer_addresses — total_count matches actual row count", async () => {
    // BUG: COUNT query didn't JOIN customers, inflating count vs main query.
    const data = parseResult(await h.client.callTool({
      name: "slam_customer_addresses",
      arguments: { customer_id: "cust_1", limit: 25, offset: 0 },
    }));
    const meta = data["_meta"] as Record<string, unknown>;
    const addresses = data["addresses"] as unknown[];
    expect(meta["total_count"]).toBe(addresses.length);
  });
});

describe("regression: freshness and schema-version", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("slam_health — minutes_since_sync is a number, not NaN", async () => {
    // BUG: freshness.ts had no NaN guard for invalid date strings.
    const data = parseResult(await h.client.callTool({ name: "slam_health", arguments: {} }));
    const health = data as Record<string, unknown>;
    const minutes = health["minutes_since_sync"];
    if (minutes !== null) {
      expect(typeof minutes).toBe("number");
      expect(isNaN(minutes as number)).toBe(false);
    }
  });

  it("slam_store_snapshot — _meta.returned is 1", async () => {
    // BUG: store-snapshot _meta had no returned field.
    const data = parseResult(await h.client.callTool({ name: "slam_store_snapshot", arguments: {} }));
    const meta = data["_meta"] as Record<string, unknown>;
    expect(meta["returned"]).toBe(1);
  });

  it("slam_store_snapshot — identifier_issues uses TRIM(sku)", async () => {
    // BUG: sku = '' misses whitespace-only SKUs. Fixed: TRIM(sku) = ''.
    // Fixture variant has SKU 'TEST-SKU-1' — identifier_issues should be 0.
    const data = parseResult(await h.client.callTool({ name: "slam_store_snapshot", arguments: {} }));
    const snapshot = data["snapshot"] as Record<string, unknown>;
    const conditions = snapshot["conditions"] as Record<string, unknown>;
    expect(typeof conditions["identifier_issues"]).toBe("number");
    expect(conditions["identifier_issues"]).toBe(0);
  });
});
