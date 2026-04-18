import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, assertMeta, type TestHarness } from "../helpers.js";

describe("orders tools", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("slam_orders_list returns orders", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_orders_list", arguments: {} }));
    assertMeta(data, "orders", "list");
    expect((data["orders"] as unknown[]).length).toBeGreaterThan(0);
  });

  it("slam_order_line_items_list queries order_line_items table", async () => {
    const data = parseResult(await h.client.callTool({
      name: "slam_order_line_items_list",
      arguments: { order_id: "ord_1" },
    }));
    expect(Array.isArray(data["line_items"])).toBe(true);
  });

  it("slam_discounts_summary queries order_discount_codes", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_discounts_summary", arguments: {} }));
    expect(Array.isArray(data["discounts"])).toBe(true);
  });

  it("slam_fulfillment_tracking queries fulfillments table", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_fulfillment_tracking", arguments: {} }));
    expect(Array.isArray(data["fulfillments"])).toBe(true);
  });

  it("slam_refunds_summary queries refunds + refund_line_items", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_refunds_summary", arguments: {} }));
    expect(Array.isArray(data["refunds"])).toBe(true);
  });
});
