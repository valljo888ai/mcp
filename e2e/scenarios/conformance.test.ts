/**
 * Conformance tests — structural invariants that every tool must satisfy.
 *
 * Tools are discovered automatically via listTools() at test startup.
 * Required params are resolved from the live JSON Schema using KNOWN_VALUES.
 * Pagination is detected from the presence of an 'offset' property in the schema.
 *
 * No manual lists to maintain — add a new param name to KNOWN_VALUES when a
 * new required non-defaulted param is introduced.
 */
import { describe, it, beforeAll, afterAll } from "vitest";
import { createTestHarness, parseResult, type TestHarness } from "../helpers.js";

// ---------------------------------------------------------------------------
// Semantic values for known param names — applies to ANY tool that has these.
// This is the ONLY thing to update when a new param name is introduced.
// ---------------------------------------------------------------------------
const KNOWN_VALUES: Record<string, unknown> = {
  product_id:    "prod_1",
  variant_id:    "var_1",
  customer_id:   "cust_1",
  order_id:      "ord_1",
  collection_id: "coll_1",
  query:         "test",
  sku:           "test-sku",
  sql:           "SELECT 1 AS n",
  owner_type:    "PRODUCT",
};

// Fallback by JSON Schema type for required params not in KNOWN_VALUES
function defaultForType(type: string | string[]): unknown {
  const t = Array.isArray(type) ? type[0] : type;
  if (t === "integer" || t === "number") return 1;
  return "";
}

// ---------------------------------------------------------------------------
// ToolInfo — derived from the live schema returned by listTools()
// ---------------------------------------------------------------------------
type ToolInfo = {
  name: string;
  args: Record<string, unknown>;
  paginated: boolean;
};

function buildToolInfo(tool: {
  name: string;
  inputSchema: Record<string, unknown>;
}): ToolInfo {
  const schema = tool.inputSchema as {
    properties?: Record<string, { type?: string | string[]; default?: unknown }>;
    required?: string[];
  };

  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  // Detect pagination: tool has an 'offset' property in its schema
  const paginated = "offset" in properties;

  // Build args: only required params that have no default
  const args: Record<string, unknown> = {};
  for (const [paramName, def] of Object.entries(properties)) {
    if (!required.has(paramName)) continue;   // optional — skip
    if ("default" in def) continue;           // has a default — skip
    // Required with no default: resolve value
    args[paramName] =
      paramName in KNOWN_VALUES
        ? KNOWN_VALUES[paramName]
        : defaultForType(def.type ?? "string");
  }

  return { name: tool.name, args, paginated };
}

// ---------------------------------------------------------------------------
// Shared tool list — populated by the first describe block's beforeAll
// ---------------------------------------------------------------------------
let tools: ToolInfo[] = [];

// ---------------------------------------------------------------------------
// Invariant 1: _meta.returned is always a number
// ---------------------------------------------------------------------------
describe("conformance: _meta.returned is always a number", () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestHarness();
    const result = await h.client.listTools();
    tools = result.tools.map(buildToolInfo);
  });

  afterAll(async () => { await h.teardown(); });

  it("all discovered tools return _meta.returned as a number", async () => {
    const failures: string[] = [];

    for (const { name, args } of tools) {
      try {
        const data = parseResult(await h.client.callTool({ name, arguments: args }));
        const meta = data["_meta"] as Record<string, unknown> | undefined;
        if (!meta) continue; // tools without _meta (if any)
        if (typeof meta["returned"] !== "number")
          failures.push(`${name}: _meta.returned is ${typeof meta["returned"]}, expected number`);
      } catch (err) {
        failures.push(`${name}: threw — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (failures.length > 0)
      throw new Error(`${failures.length} tool(s) failed:\n${failures.join("\n")}`);
  });
});

// ---------------------------------------------------------------------------
// Invariant 2: paginated tools expose total_count, has_more, and offset
// ---------------------------------------------------------------------------
describe("conformance: paginated tools have total_count, has_more, offset", () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestHarness();
    if (tools.length === 0) {
      const result = await h.client.listTools();
      tools = result.tools.map(buildToolInfo);
    }
  });

  afterAll(async () => { await h.teardown(); });

  it("all paginated tools have complete pagination _meta", async () => {
    const failures: string[] = [];

    for (const { name, args, paginated } of tools) {
      if (!paginated) continue;
      try {
        const data = parseResult(await h.client.callTool({ name, arguments: args }));
        const meta = data["_meta"] as Record<string, unknown>;
        if (typeof meta["total_count"] !== "number")
          failures.push(`${name}: total_count missing or not a number`);
        if (typeof meta["has_more"] !== "boolean")
          failures.push(`${name}: has_more missing or not a boolean`);
        if (typeof meta["offset"] !== "number")
          failures.push(`${name}: offset missing or not a number`);
      } catch (err) {
        failures.push(`${name}: threw — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (failures.length > 0)
      throw new Error(`${failures.length} tool(s) failed:\n${failures.join("\n")}`);
  });
});

// ---------------------------------------------------------------------------
// Invariant 3: freshness_tier is always a valid value when present
// ---------------------------------------------------------------------------
describe("conformance: freshness_tier is always valid", () => {
  let h: TestHarness;
  const VALID_TIERS = new Set(["fresh", "stale", "very_stale", "outdated", "unknown"]);

  beforeAll(async () => {
    h = await createTestHarness();
    if (tools.length === 0) {
      const result = await h.client.listTools();
      tools = result.tools.map(buildToolInfo);
    }
  });

  afterAll(async () => { await h.teardown(); });

  it("all discovered tools return a valid freshness_tier", async () => {
    const failures: string[] = [];

    for (const { name, args } of tools) {
      try {
        const data = parseResult(await h.client.callTool({ name, arguments: args }));
        const meta = data["_meta"] as Record<string, unknown> | undefined;
        if (!meta || !("freshness_tier" in meta)) continue;
        if (!VALID_TIERS.has(meta["freshness_tier"] as string))
          failures.push(`${name}: freshness_tier "${meta["freshness_tier"]}" is not valid`);
      } catch (err) {
        failures.push(`${name}: threw — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (failures.length > 0)
      throw new Error(`${failures.length} tool(s) failed:\n${failures.join("\n")}`);
  });
});
