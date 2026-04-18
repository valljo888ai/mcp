import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, type TestHarness } from "../helpers.js";

describe("new Gadget tools", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("slam_returns_summary returns returns array", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_returns_summary", arguments: {} }));
    expect(Array.isArray(data["returns"])).toBe(true);
  });

  it("slam_draft_orders_list returns draft_orders array", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_draft_orders_list", arguments: {} }));
    expect(Array.isArray(data["draft_orders"])).toBe(true);
  });

  it("slam_b2b_companies_list returns companies array", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_b2b_companies_list", arguments: {} }));
    expect(Array.isArray(data["companies"])).toBe(true);
  });

  it("slam_content_pages returns pages and articles", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_content_pages", arguments: {} }));
    expect(Array.isArray(data["content"])).toBe(true);
  });

  it("slam_discounts_active returns active discounts", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_discounts_active", arguments: {} }));
    expect(Array.isArray(data["discounts"])).toBe(true);
  });

  it("slam_gift_cards_summary returns balance summary", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_gift_cards_summary", arguments: {} }));
    expect(data["total_outstanding_balance"]).toBeDefined();
  });

  it("slam_selling_plans_list returns selling plan groups", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_selling_plans_list", arguments: {} }));
    expect(Array.isArray(data["plans"])).toBe(true);
  });
});
