/**
 * better-sqlite3 singleton — readonly, query_only, hot-reload, retry.
 *
 * The MCP server does NOT depend on @slam/core. It reads .db files directly.
 */

import Database from "better-sqlite3";
import { statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createViews } from "./views.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DbInstance {
  /** The live better-sqlite3 handle. */
  db: Database.Database;
  /** Absolute path to the .db file. */
  path: string;
  /** Last-observed mtime (epoch ms). */
  mtime: number;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _instance: DbInstance | null = null;
let _reloadInProgress = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDbPath(): string {
  // Priority 1: explicit env var (set by --db arg in cli.ts or caller's env config)
  if (process.env["SLAM_DB_PATH"]) return process.env["SLAM_DB_PATH"];

  // Priority 2: auto-discover first *.db file in ./slam/data/
  try {
    const files = readdirSync("./slam/data").filter((f) => f.endsWith(".db"));
    if (files.length > 0) {
      const discovered = join("./slam/data", files[0]);
      process.stderr.write(`[slam-mcp] Auto-discovered DB: ${discovered}\n`);
      return discovered;
    }
  } catch {
    // ./slam/data doesn't exist — fall through
  }

  // Priority 3: legacy default
  return "./store.db";
}

function getMtime(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      const envSet = Boolean(process.env["SLAM_DB_PATH"]);
      const hint = envSet
        ? `SLAM_DB_PATH is set to "${filePath}" but the file does not exist. Check the path in your MCP server env config.`
        : `No DB found at "${filePath}". Options: (1) --db ./slam/data/your-store.db, (2) set SLAM_DB_PATH env var, (3) place a .db file in ./slam/data/ for auto-discovery.`;
      throw new Error(hint);
    }
    throw err;
  }
}

function openDatabase(filePath: string): Database.Database {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });

  // PRAGMA setup — order matters:
  // 1. createViews first (CREATE TEMP VIEW requires write access to the temp
  //    schema, which query_only blocks)
  // 2. query_only = ON last (locks all writes after setup is complete)
  //
  // Note: journal_mode is NOT set here. WAL mode is a database-level property
  // written by the sync path (create-database.ts). A readonly connection
  // automatically uses whatever mode the file was created with — setting it
  // here would fail for exported/downloaded DBs in DELETE mode.

  // Create runtime TEMP views — non-fatal if the .db lacks SLAM tables.
  // Per Principles.md: "SLAM is one spoke, not the hub." The MCP server
  // must handle arbitrary .db files gracefully. Individual tools will fail
  // with clear errors rather than the whole server crashing on open.
  try {
    createViews(db);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[slam-mcp] Warning: could not create SLAM views (non-SLAM .db?): ${msg}\n`,
    );
  }

  db.pragma("query_only = ON");

  return db;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the singleton database instance, opening or reloading as needed.
 *
 * Hot-reload: if the .db file's mtime has changed since last access the
 * connection is closed and re-opened so queries always reflect the latest
 * sync data.
 */
export function getDb(): DbInstance {
  const filePath = resolveDbPath();

  // First open
  if (!_instance) {
    const mtime = getMtime(filePath);
    const db = openDatabase(filePath);
    _instance = { db, path: filePath, mtime };
    return _instance;
  }

  // Hot-reload check
  if (!_reloadInProgress) {
    const currentMtime = getMtime(filePath);
    if (currentMtime !== _instance.mtime) {
      _reloadInProgress = true;
      const prevInstance = _instance;
      try {
        const db = openDatabase(filePath);
        prevInstance.db.close();
        _instance = { db, path: filePath, mtime: currentMtime };
      } catch (err) {
        _instance = prevInstance;
        process.stderr.write(
          `[slam-mcp] Warning: hot-reload failed, keeping previous connection: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      } finally {
        _reloadInProgress = false;
      }
    }
  }

  return _instance;
}

/**
 * Gracefully close the database connection. Called during shutdown.
 */
export function closeDb(): void {
  if (_instance) {
    try {
      _instance.db.close();
    } catch {
      // Swallowing close errors during shutdown is acceptable.
    }
    _instance = null;
  }
  _reloadInProgress = false;
}
