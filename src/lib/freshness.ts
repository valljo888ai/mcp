import type Database from "better-sqlite3";

export type FreshnessTier = "fresh" | "stale" | "very_stale" | "outdated" | "unknown";

export interface FreshnessInfo {
  last_sync_at: string | null;
  minutes_since_sync: number | null;
  freshness_tier: FreshnessTier;
}

/**
 * Compute freshness from the sync_metadata table (Gadget schema).
 *
 * Reads key = 'lastSyncedAt'. Returns null values if the table does not exist
 * or the key is missing.
 */
export function getFreshness(db: Database.Database): FreshnessInfo {
  try {
    const row = db
      .prepare("SELECT value FROM sync_metadata WHERE key = ?")
      .get("lastSyncedAt") as { value: string } | undefined;

    if (!row?.value) {
      return { last_sync_at: null, minutes_since_sync: null, freshness_tier: "unknown" };
    }

    const minutes = Math.floor((Date.now() - new Date(row.value).getTime()) / 60_000);

    if (isNaN(minutes)) {
      return { last_sync_at: row.value, minutes_since_sync: null, freshness_tier: "unknown" };
    }

    const freshness_tier: FreshnessTier =
      minutes < 15   ? "fresh"      :
      minutes < 60   ? "stale"      :
      minutes < 1440 ? "very_stale" :
                       "outdated";

    return { last_sync_at: row.value, minutes_since_sync: minutes, freshness_tier };
  } catch {
    return { last_sync_at: null, minutes_since_sync: null, freshness_tier: "unknown" };
  }
}
