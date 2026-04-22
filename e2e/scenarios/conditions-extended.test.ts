/**
 * E2e coverage for all four conditions tools (data quality check tools).
 *
 * Each tool calls runChecks(db, "conditions", CHECKS) and returns:
 *   { checks: CheckResult[], _meta: { output_type: "report", domain: "conditions", ... } }
 *
 * Fixture is clean — all condition counts are 0; checks_with_results = 0 for all tools.
 *
 * Named checks per tool:
 *   slam_conditions_customers: missing_email, duplicate_email, zero_orders, zero_total_spent
 *   slam_conditions_inventory: out_of_stock, negative_inventory, untracked
 *   slam_conditions_orders:    zero_line_items, missing_customer_email, zero_total_price, refunded_unfulfilled
 *   slam_conditions_pricing:   price_zero, compare_at_inverted, compare_at_equals_price
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, type TestHarness } from "../helpers.js";

// ---------------------------------------------------------------------------
// Shared structural validator
// ---------------------------------------------------------------------------

function assertConditionsShape(
  data: Record<string, unknown>,
  expectedCheckNames: string[],
): void {
  expect(Array.isArray(data["checks"])).toBe(true);
  const meta = data["_meta"] as Record<string, unknown>;
  expect(meta).toBeDefined();
  expect(meta["domain"]).toBe("conditions");
  expect(meta["output_type"]).toBe("report");
  expect(typeof meta["total_checks"]).toBe("number");
  expect(typeof meta["checks_with_results"]).toBe("number");
  expect(typeof meta["returned"]).toBe("number");
  const checks = data["checks"] as Record<string, unknown>[];
  expect(checks.length).toBe(expectedCheckNames.length);
  expect(meta["total_checks"]).toBe(expectedCheckNames.length);
  const totalCount = checks.reduce((s, c) => s + (c["count"] as number), 0);
  expect(meta["returned"]).toBe(totalCount);
  const names = checks.map((c) => c["name"]);
  for (const name of expectedCheckNames) {
    expect(names).toContain(name);
  }
  for (const check of checks) {
    expect(typeof check["name"]).toBe("string");
    expect(typeof check["description"]).toBe("string");
    expect(typeof check["count"]).toBe("number");
    expect(Array.isArray(check["samples"])).toBe(true);
    expect(check).not.toHaveProperty("error");
  }
}

// ---------------------------------------------------------------------------
// slam_conditions_customers
// ---------------------------------------------------------------------------

describe("slam_conditions_customers", () => {
  let h: TestHarness;
  let data: Record<string, unknown>;
  beforeAll(async () => {
    h = await createTestHarness();
    data = parseResult(
      await h.client.callTool({ name: "slam_conditions_customers", arguments: {} }),
    );
  });
  afterAll(async () => { await h.teardown(); });

  it("returns correct shape with all 4 named checks", () => {
    assertConditionsShape(data, [
      "missing_email",
      "duplicate_email",
      "zero_orders",
      "zero_total_spent",
    ]);
  });

  it("zero_orders count=0 for clean fixture (cust_1 has ord_1)", () => {
    expect(data["checks"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "zero_orders", count: 0, samples: [] }),
      ])
    );
  });

  it("_meta.checks_with_results=0 for clean fixture", () => {
    const meta = data["_meta"] as Record<string, unknown>;
    expect(meta["checks_with_results"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// slam_conditions_inventory
// ---------------------------------------------------------------------------

describe("slam_conditions_inventory", () => {
  let h: TestHarness;
  let data: Record<string, unknown>;
  beforeAll(async () => {
    h = await createTestHarness();
    data = parseResult(
      await h.client.callTool({ name: "slam_conditions_inventory", arguments: {} }),
    );
  });
  afterAll(async () => { await h.teardown(); });

  it("returns correct shape with all 3 named checks", () => {
    assertConditionsShape(data, [
      "out_of_stock",
      "negative_inventory",
      "untracked",
    ]);
  });

  it("out_of_stock count=0 for clean fixture (var_1 has inventory_quantity=100)", () => {
    expect(data["checks"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "out_of_stock", count: 0, samples: [] }),
      ])
    );
  });

  it("untracked count=0 for clean fixture (invitem_1 has tracked=1)", () => {
    expect(data["checks"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "untracked", count: 0, samples: [] }),
      ])
    );
  });

  it("_meta.checks_with_results=0 for clean fixture", () => {
    const meta = data["_meta"] as Record<string, unknown>;
    expect(meta["checks_with_results"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// slam_conditions_orders
// ---------------------------------------------------------------------------

describe("slam_conditions_orders", () => {
  let h: TestHarness;
  let data: Record<string, unknown>;
  beforeAll(async () => {
    h = await createTestHarness();
    data = parseResult(
      await h.client.callTool({ name: "slam_conditions_orders", arguments: {} }),
    );
  });
  afterAll(async () => { await h.teardown(); });

  it("returns correct shape with all 4 named checks", () => {
    assertConditionsShape(data, [
      "zero_line_items",
      "missing_customer_email",
      "zero_total_price",
      "refunded_unfulfilled",
    ]);
  });

  it("zero_line_items count=0 for clean fixture (ord_1 has li_1)", () => {
    expect(data["checks"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "zero_line_items", count: 0, samples: [] }),
      ])
    );
  });

  it("zero_total_price count=0 for clean fixture (ord_1 total_price=29.99)", () => {
    expect(data["checks"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "zero_total_price", count: 0, samples: [] }),
      ])
    );
  });

  it("_meta.checks_with_results=0 for clean fixture", () => {
    const meta = data["_meta"] as Record<string, unknown>;
    expect(meta["checks_with_results"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// slam_conditions_pricing
// ---------------------------------------------------------------------------

describe("slam_conditions_pricing", () => {
  let h: TestHarness;
  let data: Record<string, unknown>;
  beforeAll(async () => {
    h = await createTestHarness();
    data = parseResult(
      await h.client.callTool({ name: "slam_conditions_pricing", arguments: {} }),
    );
  });
  afterAll(async () => { await h.teardown(); });

  it("returns correct shape with all 3 named checks", () => {
    assertConditionsShape(data, [
      "price_zero",
      "compare_at_inverted",
      "compare_at_equals_price",
    ]);
  });

  it("price_zero count=0 for clean fixture (var_1 price=29.99)", () => {
    expect(data["checks"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "price_zero", count: 0, samples: [] }),
      ])
    );
  });

  it("compare_at_inverted count=0 for clean fixture (var_1 compare_at=39.99 > price=29.99)", () => {
    expect(data["checks"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "compare_at_inverted", count: 0, samples: [] }),
      ])
    );
  });

  it("_meta.checks_with_results=0 for clean fixture", () => {
    const meta = data["_meta"] as Record<string, unknown>;
    expect(meta["checks_with_results"]).toBe(0);
  });
});
