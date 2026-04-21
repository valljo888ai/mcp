import type Database from "better-sqlite3";
import { GADGET_SCHEMA_VERSION } from "../constants.js";

export function assertSchemaVersion(db: Database.Database): void {
  try {
    const row = db
      .prepare("SELECT schema_version FROM _slam_meta LIMIT 1")
      .get() as { schema_version: string } | undefined;

    const actual = row?.schema_version ?? "unknown";
    if (actual !== GADGET_SCHEMA_VERSION) {
      process.stderr.write(
        `[slam-mcp] WARNING: Expected Gadget schema version ${GADGET_SCHEMA_VERSION}, ` +
        `found ${actual}. Re-sync and re-download your .db file.\n`
      );
    }
  } catch {
    // _slam_meta missing — non-SLAM .db, skip
  }
}
