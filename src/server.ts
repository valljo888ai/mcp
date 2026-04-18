import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SLAM_MCP_VERSION } from "./constants.js";
import { registerAll } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "@slam-commerce/mcp", version: SLAM_MCP_VERSION });
  registerAll(server);
  return server;
}
