import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, type TestHarness } from "../helpers.js";

describe("customers tools", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("slam_customers_by_tag queries customer_tags table", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_customers_by_tag", arguments: {} }));
    const tags = data["tags"] as Record<string, unknown>[];
    expect(tags[0]).toHaveProperty("tag");
    expect(tags[0]).toHaveProperty("customer_count");
  });

  it("slam_customer_addresses returns customer_addresses rows", async () => {
    const data = parseResult(await h.client.callTool({
      name: "slam_customer_addresses",
      arguments: { customer_id: "cust_1" },
    }));
    expect(Array.isArray(data["addresses"])).toBe(true);
  });
});
