import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, assertMeta, type TestHarness } from "../helpers.js";

describe("products tools", () => {
  let h: TestHarness;
  beforeAll(async () => { h = await createTestHarness(); });
  afterAll(async () => { await h.teardown(); });

  it("slam_products_list returns products array with _meta", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_products_list", arguments: { limit: 10 } }));
    assertMeta(data, "products", "list");
    expect(Array.isArray(data["products"])).toBe(true);
    expect((data["products"] as unknown[]).length).toBeGreaterThan(0);
  });

  it("slam_product_images queries product_media table", async () => {
    const data = parseResult(await h.client.callTool({ name: "slam_product_images", arguments: {} }));
    expect(Array.isArray(data["images"])).toBe(true);
  });

  it("slam_products_get returns lowercase Gadget product metafields", async () => {
    const data = parseResult(await h.client.callTool({
      name: "slam_products_get",
      arguments: { id: "prod_1" },
    }));
    assertMeta(data, "products", "detail");
    const product = data["product"] as Record<string, unknown>;
    expect(product["id"]).toBe("prod_1");
    expect(product["metafields"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner_type: "product",
          namespace: "custom",
          key: "material",
          value: "cotton",
        }),
      ]),
    );
  });

  it("slam_variant_options queries product_options table", async () => {
    const data = parseResult(await h.client.callTool({
      name: "slam_variant_options",
      arguments: { product_id: "prod_1" },
    }));
    expect(Array.isArray(data["options"])).toBe(true);
  });
});
