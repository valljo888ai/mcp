import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAll } from "../src/tools/index.js";
import { closeDb } from "../src/lib/db.js";

export const DB_PATH = process.env.SLAM_DB_PATH ?? "./e2e/fixture/store.db";

export interface TestHarness {
  client: Client;
  teardown: () => Promise<void>;
}

export async function createTestHarness(): Promise<TestHarness> {
  process.env.SLAM_DB_PATH = DB_PATH;

  const server = new McpServer({ name: "slam-mcp-e2e", version: "0.1.0" });
  registerAll(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "e2e-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  // Initialize the session — every test harness calls slam_health first
  await client.callTool({ name: "slam_health", arguments: {} });

  return {
    client,
    teardown: async () => {
      await client.close();
      closeDb();
    },
  };
}

type ContentBlock = { type: string; text?: string };
type ToolCallResult = { content: ContentBlock[] };

export function parseResult(
  result: Awaited<ReturnType<Client["callTool"]>>,
): Record<string, unknown> {
  const typed = result as unknown as ToolCallResult;
  const block = typed.content[0];
  if (!block || block.type !== "text") {
    throw new Error(`Expected text content block, got: ${JSON.stringify(block)}`);
  }
  return JSON.parse(block.text ?? "") as Record<string, unknown>;
}

export function assertMeta(
  data: Record<string, unknown>,
  expectedDomain: string,
  expectedOutputType: string,
): void {
  const meta = data["_meta"] as Record<string, unknown> | undefined;
  if (!meta) throw new Error("Missing _meta in response");
  if (meta["domain"] !== expectedDomain) {
    throw new Error(`Expected domain "${expectedDomain}", got "${meta["domain"]}"`);
  }
  if (meta["output_type"] !== expectedOutputType) {
    throw new Error(`Expected output_type "${expectedOutputType}", got "${meta["output_type"]}"`);
  }
  if (!("last_sync_at" in meta)) throw new Error("Missing last_sync_at");
  if (!("minutes_since_sync" in meta)) throw new Error("Missing minutes_since_sync");
}
