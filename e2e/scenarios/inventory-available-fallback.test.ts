import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, type TestHarness } from "../helpers.js";

describe("slam_inventory_alerts — inventory_quantity fallback", () => {
  let harness: TestHarness;
  beforeAll(async () => { harness = await createTestHarness(); });
  afterAll(async () => { await harness.teardown(); });

  it("no alert has total_available above the threshold", async () => {
    const result = await harness.client.callTool({
      name: "slam_inventory_alerts",
      arguments: { threshold: 5 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const data = JSON.parse(text);
    for (const a of data.alerts as Array<{ total_available: number }>) {
      expect(a.total_available).toBeLessThanOrEqual(5);
    }
  });

  it("out_of_stock count is less than total variants when inventory_quantity > 0 exists", async () => {
    const variantResult = await harness.client.callTool({
      name: "slam_run_query",
      arguments: { sql: "SELECT COUNT(*) as cnt FROM variants WHERE inventory_quantity > 0" },
    });
    const variantText = (variantResult.content as Array<{ type: string; text: string }>)[0].text;
    const variantsWithStock = (JSON.parse(variantText).rows as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    if (variantsWithStock === 0) return;

    const snapshotResult = await harness.client.callTool({ name: "slam_store_snapshot", arguments: {} });
    const snapshotText = (snapshotResult.content as Array<{ type: string; text: string }>)[0].text;
    const outOfStock = JSON.parse(snapshotText).snapshot.inventory.out_of_stock as number;

    const totalResult = await harness.client.callTool({
      name: "slam_run_query",
      arguments: { sql: "SELECT COUNT(*) as cnt FROM variants" },
    });
    const totalText = (totalResult.content as Array<{ type: string; text: string }>)[0].text;
    const totalVariants = (JSON.parse(totalText).rows as Array<{ cnt: number }>)[0]?.cnt ?? 0;

    expect(outOfStock).toBeLessThan(totalVariants);
  });
});
