#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { closeDb, getDb } from "./lib/db.js";
import { assertSchemaVersion } from "./lib/schema-version.js";

// --db <path> takes highest priority, overrides SLAM_DB_PATH and auto-discovery
const dbArgIndex = process.argv.indexOf("--db");
if (dbArgIndex !== -1 && process.argv[dbArgIndex + 1]) {
  process.env["SLAM_DB_PATH"] = process.argv[dbArgIndex + 1];
}


const server = createServer();
const transport = new StdioServerTransport();

process.on("SIGINT", () => { closeDb(); process.exit(0); });
process.on("SIGTERM", () => { closeDb(); process.exit(0); });

try { const { db } = getDb(); assertSchemaVersion(db); } catch { /* DB not found yet */ }

await server.connect(transport);
