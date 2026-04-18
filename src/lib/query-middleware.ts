/**
 * Query middleware pipeline for slam_run_query.
 *
 * 1. Validate — first token must be SELECT/PRAGMA/EXPLAIN/WITH
 * 2. Money warning — if query touches price/amount columns, append note
 * 3. Metafield guard — if querying metafields without owner_id filter, warn
 * 4. Execute — run query with parameterized inputs
 * 5. Paginate — LIMIT/OFFSET with default 25, max 100
 * 6. Error handling — on failure, fuzzy-match table/column names and suggest
 */

import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_FIRST_TOKENS = new Set(["SELECT", "PRAGMA", "EXPLAIN", "WITH"]);

const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

/** Columns that store money as TEXT — users need CAST for math. */
const MONEY_COLUMNS = new Set([
  "price",
  "compare_at_price",
  "total_price",
  "subtotal_price",
  "total_spent",
  "cost",
  "value",
]);

/** All known table names for fuzzy suggestion. */
const KNOWN_TABLES = [
  // Core catalog
  "products", "variants", "product_options", "product_option_values",
  "product_media", "product_tags", "collections", "collection_tags", "collects",
  // Commerce
  "orders", "order_line_items", "order_discount_codes", "order_shipping_lines",
  "draft_orders", "draft_order_line_items",
  "customers", "customer_addresses", "customer_tags", "discounts",
  // Fulfillment & returns
  "fulfillments", "fulfillment_orders", "fulfillment_order_line_items",
  "refunds", "refund_line_items", "returns", "return_line_items",
  // Inventory
  "inventory_items", "inventory_levels", "locations",
  // Content
  "pages", "blogs", "articles", "redirects",
  // B2B
  "companies", "company_locations", "company_contacts", "catalogs",
  // Subscriptions
  "selling_plan_groups", "selling_plans", "selling_plan_group_products",
  // Gift cards & pricing
  "gift_cards", "price_lists",
  // Markets
  "markets", "shop",
  // Metafields
  "metafields",
  // SLAM meta
  "_slam_meta", "_slam_tables", "sync_metadata",
  // TEMP views
  "product_sales", "variant_stock_health", "product_collection_map",
  "price_comparison", "inventory_by_location", "customer_lifetime_value",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryResult {
  rows: Record<string, unknown>[];
  warnings: string[];
  row_count: number;
}

export interface QueryError {
  error: string;
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// 1. Statement validation (Layer 2 of read-only enforcement)
// ---------------------------------------------------------------------------

export function validateStatement(sql: string): string | null {
  const trimmed = sql.trim();
  if (!trimmed) return "Empty SQL statement.";

  // Extract first meaningful token (skip comments)
  const withoutComments = trimmed
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();

  const firstToken = withoutComments.split(/\s+/)[0]?.toUpperCase();
  if (!firstToken || !ALLOWED_FIRST_TOKENS.has(firstToken)) {
    return `Statement must begin with SELECT, PRAGMA, EXPLAIN, or WITH. Got: "${firstToken ?? "(empty)"}".`;
  }

  return null; // valid
}

// ---------------------------------------------------------------------------
// 2. Money column warning
// ---------------------------------------------------------------------------

function checkMoneyColumns(sql: string): string | null {
  const upper = sql.toUpperCase();
  const touched = [...MONEY_COLUMNS].filter((col) =>
    upper.includes(col.toUpperCase()),
  );
  if (touched.length > 0) {
    return `Money columns are stored as TEXT: ${touched.join(", ")}. Use CAST(column AS REAL) for arithmetic.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Metafield guard
// ---------------------------------------------------------------------------

function checkMetafieldGuard(sql: string): string | null {
  const upper = sql.toUpperCase();
  if (upper.includes("METAFIELD") && !upper.includes("OWNER_ID")) {
    return "Querying metafields without an owner_id filter may return results across all entity types. Consider adding WHERE owner_id = ? AND owner_type = ?.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. Pagination injection
// ---------------------------------------------------------------------------

function injectPagination(
  sql: string,
  limit: number,
  offset: number,
): string {
  const upper = sql.toUpperCase().trim();

  // Don't double-paginate if user already specified LIMIT
  if (upper.includes("LIMIT")) return sql;

  // Don't paginate PRAGMAs
  if (upper.startsWith("PRAGMA")) return sql;

  return `${sql.trim()} LIMIT ${limit} OFFSET ${offset}`;
}

// ---------------------------------------------------------------------------
// 6. Fuzzy suggestion on error
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }

  return dp[m]![n]!;
}

function suggestTableNames(errorMessage: string): string[] {
  // Look for "no such table: xyz" pattern
  const tableMatch = errorMessage.match(/no such table:\s*(\w+)/i);
  if (!tableMatch?.[1]) return [];

  const badName = tableMatch[1].toLowerCase();
  return KNOWN_TABLES.filter((t) => levenshtein(badName, t.toLowerCase()) <= 3)
    .slice(0, 3)
    .map((t) => `Did you mean "${t}"?`);
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

export function executeQuery(
  db: Database.Database,
  sql: string,
  params: unknown[] | Record<string, unknown> | undefined,
  limit: number = DEFAULT_LIMIT,
  offset: number = 0,
): QueryResult | QueryError {
  // Clamp limit
  const effectiveLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

  // 1. Validate
  const validationError = validateStatement(sql);
  if (validationError) {
    return { error: validationError, suggestions: [] };
  }

  // 2 & 3. Collect warnings
  const warnings: string[] = [];
  const moneyWarning = checkMoneyColumns(sql);
  if (moneyWarning) warnings.push(moneyWarning);
  const metafieldWarning = checkMetafieldGuard(sql);
  if (metafieldWarning) warnings.push(metafieldWarning);

  // 5. Inject pagination
  const paginatedSql = injectPagination(sql, effectiveLimit, offset);

  // 4. Execute
  try {
    const stmt = db.prepare(paginatedSql);
    const rows = (
      params ? stmt.all(...(Array.isArray(params) ? params : [params])) : stmt.all()
    ) as Record<string, unknown>[];

    return {
      rows,
      warnings,
      row_count: rows.length,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown query error.";
    const suggestions = suggestTableNames(message);
    return { error: message, suggestions };
  }
}
