/**
 * Gate enforcement tests.
 *
 * These tests MUST run in their own worker (separate file) so the session
 * module singleton starts uninitialized. Vitest isolates each test file in
 * its own module context, giving us a clean _sessionToken = null on entry.
 */
import { describe, it, expect } from "vitest";
import { createUninitializedHarness, parseResult } from "../helpers.js";

describe("session gate", () => {
  it("blocks non-health tools before slam_health is called", async () => {
    const h = await createUninitializedHarness();
    try {
      const result = await h.client.callTool({ name: "slam_products_list", arguments: {} });
      const data = parseResult(result);
      expect(data["session_token_required"]).toBe(true);
      expect(data["error"]).toMatch(/slam_health must be called first/);
    } finally {
      await h.teardown();
    }
  });
});
