#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { closeDb, getDb } from "./lib/db.js";
import { assertSchemaVersion } from "./lib/schema-version.js";

const server = createServer();
const transport = new StdioServerTransport();

process.on("SIGINT", () => { closeDb(); process.exit(0); });
process.on("SIGTERM", () => { closeDb(); process.exit(0); });

try { const { db } = getDb(); assertSchemaVersion(db); } catch { /* DB not found yet */ }

await server.connect(transport);
