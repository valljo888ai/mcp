/**
 * Shared pattern for data condition tools (ECF).
 *
 * Each condition tool defines an array of CheckDef items. The runChecks()
 * function executes them efficiently: count first, then sample only when
 * count > 0.
 */

import type Database from "better-sqlite3";
import { getFreshness, type FreshnessInfo } from "./freshness.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckDef {
  /** Machine-readable name, e.g. "description_empty". */
  name: string;
  /** Human-readable neutral description, e.g. "Products where description is null or empty". */
  description: string;
  /** SQL that returns a single `cnt` column. */
  countSql: string;
  /** SQL that returns sample rows. Must accept a LIMIT param as the last binding. */
  sampleSql: string;
  /** Optional static bindings for both count and sample queries. */
  params?: unknown[];
}

export interface CheckResult {
  name: string;
  description: string;
  count: number;
  samples: Record<string, unknown>[];
  error?: string;
}

export interface ChecksResponse {
  checks: CheckResult[];
  _meta: {
    domain: string;
    output_type: "report";
    last_sync_at: FreshnessInfo["last_sync_at"];
    minutes_since_sync: FreshnessInfo["minutes_since_sync"];
    freshness_tier: FreshnessInfo["freshness_tier"];
    total_checks: number;
    checks_with_results: number;
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Execute an array of check definitions against the database.
 *
 * For each check:
 * 1. Run countSql to get the count of matching rows.
 * 2. If count > 0, run sampleSql with a LIMIT to get sample rows.
 *
 * @param db - The database instance.
 * @param domain - The domain name for the _meta envelope (e.g. "conditions").
 * @param checks - Array of check definitions.
 * @param sampleLimit - Max sample rows per check (default 5).
 */
export function runChecks(
  db: Database.Database,
  domain: string,
  checks: CheckDef[],
  sampleLimit = 5,
): ChecksResponse {
  const freshness = getFreshness(db);
  const results: CheckResult[] = [];

  for (const check of checks) {
    const bindings = check.params ?? [];

    try {
      const countRow = db
        .prepare(check.countSql)
        .get(...bindings) as { cnt: number } | undefined;
      const count = countRow?.cnt ?? 0;

      let samples: Record<string, unknown>[] = [];
      if (count > 0) {
        samples = db
          .prepare(check.sampleSql)
          .all(...bindings, sampleLimit) as Record<string, unknown>[];
      }

      results.push({
        name: check.name,
        description: check.description,
        count,
        samples,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        name: check.name,
        description: check.description,
        count: 0,
        samples: [],
        error: message,
      });
    }
  }

  return {
    checks: results,
    _meta: {
      domain,
      output_type: "report",
      last_sync_at: freshness.last_sync_at,
      minutes_since_sync: freshness.minutes_since_sync,
      freshness_tier: freshness.freshness_tier,
      total_checks: results.length,
      checks_with_results: results.filter((r) => r.count > 0).length,
    },
  };
}
