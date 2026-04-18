import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, type TestHarness } from "../helpers.js";

describe("inventory tools", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("slam_inventory_levels includes location_name", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_inventory_levels", arguments: {} }));
    const levels = data["levels"] as Record<string, unknown>[];
    expect(levels.length).toBeGreaterThan(0);
    expect(levels[0]).toHaveProperty("location_name");
  });

  it("slam_inventory_by_location includes location_name from TEMP view", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_inventory_by_location", arguments: {} }));
    const rows = data["locations"] as Record<string, unknown>[];
    expect(rows[0]).toHaveProperty("location_name");
  });

  it("slam_locations_list returns locations table", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_locations_list", arguments: {} }));
    expect(Array.isArray(data["locations"])).toBe(true);
  });
});
