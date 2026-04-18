# @slam-commerce/mcp

MCP server for SLAM Gadget — expose your Shopify SQLite database to AI tools.

---

## Requirements

- Node.js 20+
- A SLAM Gadget `.db` file (schema version 3, downloaded from the Gadget dashboard)
- `SLAM_DB_PATH` environment variable pointing to the absolute path of the file

---

## Installation

### Step 1 — Install globally (required for fast startup)

```bash
npm install -g @slam-commerce/mcp@2
```

> **Why global?** Native modules like `better-sqlite3` must compile once on your machine. Using `npx` causes a 10–30 second cold start on every session while npm reinstalls and recompiles. Global install runs that cost once.

On Windows, if the install fails with a `node-gyp` error, first run:
```bash
npm install -g node-gyp@latest
npm install -g @slam-commerce/mcp@2
```

### Step 2 — Configure your MCP client

**Claude Desktop** — add to config:

```json
{
  "mcpServers": {
    "slam": {
      "command": "slam-mcp",
      "env": {
        "SLAM_DB_PATH": "/absolute/path/to/store.db"
      }
    }
  }
}
```

Config file locations:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Claude Code / Cursor** — run once:

```bash
claude mcp add slam --scope user \
  -e "SLAM_DB_PATH=/absolute/path/to/store.db" \
  -- slam-mcp
```

---

## Tools (60 total)

### Meta (5 tools)

| Tool | Description |
|------|-------------|
| `slam_health` | Server introspection: version, schema_version, freshness, row counts |
| `slam_meta_status` | Sync status and row counts per entity table |
| `slam_meta_store` | Store metadata (domain, currency, timezone, plan) |
| `slam_meta_schema` | Full schema reference with relationships and SQL patterns (call this first before `slam_run_query`) |
| `slam_metafields_query` | Query metafields by owner type and namespace |

### Products (5 tools)

| Tool | Description |
|------|-------------|
| `slam_products_list` | List products with optional filters (status, vendor, product_type, tag) |
| `slam_products_get` | Get a single product by ID with variants, collections, metafields |
| `slam_products_search` | Full-text search products by title or description |
| `slam_products_count` | Count products matching filters |
| `slam_product_images` | List product images from the product_media table |

### Variants (4 tools)

| Tool | Description |
|------|-------------|
| `slam_variants_list` | List variants with optional product filter |
| `slam_variants_get` | Get a single variant by ID |
| `slam_variants_search` | Search variants by SKU, title, or barcode |
| `slam_variant_options` | Product options and values from the product_options table |

### Inventory (6 tools)

| Tool | Description |
|------|-------------|
| `slam_inventory_levels` | Inventory levels per variant per location (includes location_name) |
| `slam_inventory_summary` | Stock summary across all variants |
| `slam_inventory_alerts` | Variants at or below a stock threshold |
| `slam_inventory_oversold` | Variants with negative available stock |
| `slam_inventory_by_location` | Inventory totals per location with location name |
| `slam_dead_stock` | Zero-sales variants with available stock |

### Collections (4 tools)

| Tool | Description |
|------|-------------|
| `slam_collections_list` | List collections with product count |
| `slam_collections_get` | Get a collection with its products |
| `slam_collections_for_product` | Collections that contain a specific product |
| `slam_products_for_collection` | Products within a specific collection |

### Orders (10 tools)

| Tool | Description |
|------|-------------|
| `slam_orders_list` | List orders with optional status/date filters |
| `slam_orders_get` | Get a single order with line items and discount codes |
| `slam_orders_search` | Search orders by name, email, or note |
| `slam_order_line_items_list` | Line items for a specific order |
| `slam_discounts_summary` | Summary of discount codes used across orders |
| `slam_discounts_active` | Active discount campaigns from the discounts table |
| `slam_fulfillment_tracking` | Fulfillment status from the fulfillments table |
| `slam_refunds_summary` | Refunds and refund line items |
| `slam_returns_summary` | Returns by status and period |
| `slam_draft_orders_list` | Draft orders pipeline |

### Customers (6 tools)

| Tool | Description |
|------|-------------|
| `slam_customers_list` | List customers with optional tag filter |
| `slam_customers_get` | Get a single customer by ID |
| `slam_customers_by_tag` | Tag frequency analysis from the customer_tags table |
| `slam_customers_search` | Search customers by email or name |
| `slam_customers_top` | Top customers by spend or order count |
| `slam_customer_addresses` | Customer address records |

### Prices (2 tools)

| Tool | Description |
|------|-------------|
| `slam_prices_current` | Current prices with compare_at for sale detection |
| `slam_price_analysis` | Price distribution and discount analysis |

### Conditions (6 tools)

| Tool | Description |
|------|-------------|
| `slam_conditions_content` | Content/tag conditions for product filtering |
| `slam_conditions_pricing` | Price-based conditions |
| `slam_conditions_identifiers` | ID/SKU/barcode lookups |
| `slam_conditions_inventory` | Inventory-based conditions |
| `slam_conditions_orders` | Order history conditions |
| `slam_conditions_customers` | Customer conditions |

### Reporting (5 tools)

| Tool | Description |
|------|-------------|
| `slam_sales_summary` | Revenue, order count, AOV summary |
| `slam_sales_by_period` | Sales broken down by day/week/month |
| `slam_products_top` | Best-selling products by revenue or units |
| `slam_products_bought_together` | Frequently co-purchased products |
| `slam_vendors_summary` | Vendor performance summary |

### Store-level (5 tools)

| Tool | Description |
|------|-------------|
| `slam_locations_list` | All fulfilment locations with stock summary |
| `slam_b2b_companies_list` | B2B company directory with contact count |
| `slam_content_pages` | Pages and articles for content auditing |
| `slam_gift_cards_summary` | Outstanding gift card balance by currency |
| `slam_selling_plans_list` | Subscription/selling plan groups |

### Snapshot (1 tool)

| Tool | Description |
|------|-------------|
| `slam_store_snapshot` | One-call store health overview: sales totals, inventory counts, data condition issue counts, and sync freshness |

### Ad-hoc (1 tool)

| Tool | Description |
|------|-------------|
| `slam_run_query` | Execute any read-only SELECT query against the database (call `slam_meta_schema` first to understand the schema) |

---

## Response envelope

Every tool response includes a `_meta` object:

```json
{
  "_meta": {
    "domain": "products",
    "output_type": "list",
    "last_sync_at": "2024-01-15T08:30:00.000Z",
    "minutes_since_sync": 45,
    "freshness_tier": "stale",
    "returned": 25,
    "offset": 0,
    "has_more": true
  }
}
```

### Freshness tiers

| Tier | Condition | Meaning |
|------|-----------|---------|
| `fresh` | < 15 min | Data is current |
| `stale` | 15–59 min | Minor lag |
| `very_stale` | 1–24 hours | Re-sync recommended |
| `outdated` | ≥ 24 hours | Data is old — re-sync now |

---

## Schema version

This package targets Gadget schema version 3. On startup the server reads `_slam_meta.schema_version` and writes a warning to stderr if the version does not match. Re-download your `.db` file from the Gadget dashboard if you see this warning.

---

## Known gaps vs V3

The following tools from `@slam-commerce/mcp@1.x` were removed because the Gadget database does not have change-tracking tables:

| Removed tool | Reason |
|---|---|
| `slam_inventory_history` | Requires `inventory_snapshots` table — not present in Gadget |
| `slam_prices_history` | Requires `price_snapshots` table — not present in Gadget |
| `slam_changes_recent` | Requires `change_log` table — not present in Gadget |
| `slam_changes_for_entity` | Requires `change_log` table — not present in Gadget |

---

## Security

All database connections open with `PRAGMA query_only = 1`. The `slam_run_query` tool additionally validates that the statement is a SELECT and checks the referenced tables against a known-good allowlist before execution.
