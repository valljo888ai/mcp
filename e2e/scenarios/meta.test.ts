import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, type TestHarness } from "../helpers.js";

describe("slam_health", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("returns schema_version 3 and tool_count >= 60", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_health", arguments: {} }));
    expect(data["schema_version"]).toBe("3");
    expect(data["tool_count"] as number).toBeGreaterThanOrEqual(60);
  });
});
