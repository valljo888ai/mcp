# SLAM Gadget MCP — Schema Reference

Schema Version: 3 (Gadget Shopify API 2026-04)
Tables: 56
TEMP Views: 6

---

## Table Categories

### Catalog

- **products** (id, title, body_html, handle, product_type, vendor, status, tags, category, published_at, created_at, updated_at)
- **variants** (id, product_id, title, sku, barcode, price, compare_at_price, inventory_quantity, inventory_policy, option1, option2, option3, position, taxable, available_for_sale, created_at, updated_at)
- **product_options** (id, product_id, name, position, option_values)
- **product_option_values** (id, product_option_id, name, position)
- **product_media** (id, product_id, media_content_type, alt, status, position, created_at, updated_at)
- **product_tags** (product_id, tag) — PK: (product_id, tag)
- **collection_tags** (collection_id, tag) — PK: (collection_id, tag)
- **collections** (id, title, handle, body_html, collection_type, sort_order, rules, published_at, template_suffix, image_url, updated_at)
- **collects** (id, product_id, collection_id, position, created_at) — replaces `collection_memberships` from V3

### Commerce

- **orders** (id, name, email, phone, customer_id, financial_status, fulfillment_status, total_price, subtotal_price, total_tax, total_discounts, currency, created_at, updated_at)
- **order_line_items** (id, order_id, product_id, variant_id, title, variant_title, name, sku, quantity, price, total_discount, vendor, created_at, updated_at) — replaces `line_items` from V3
- **order_discount_codes** (order_id, code, amount, type) — replaces `discount_applications` from V3
- **order_shipping_lines** (id, order_id, title, code, source, price, discounted_price, carrier_identifier)
- **order_tags** (order_id, tag)
- **draft_orders** (id, name, status, email, customer_id, order_id, currency, subtotal_price, total_price, total_tax, note, created_at, updated_at)
- **draft_order_line_items** (id, draft_order_id, product_id, variant_id, title, variant_title, sku, quantity, price, created_at, updated_at)
- **discounts** (id, title, status, starts_at, ends_at, created_at, updated_at) — discount campaigns
- **order_transactions** (id, order_id, parent_id, kind, gateway, status, amount, currency, created_at, processed_at)

### Fulfilment & Returns

- **fulfillments** (id, order_id, location_id, status, tracking_company, tracking_numbers, tracking_urls, shipment_status, created_at, updated_at)
- **fulfillment_orders** (id, order_id, assigned_location_id, status, request_status, created_at, updated_at)
- **fulfillment_order_line_items** (id, fulfillment_order_id, variant_id, inventory_item_id, quantity, remaining_quantity)
- **refunds** (id, order_id, note, created_at, processed_at)
- **refund_line_items** (id, refund_id, order_line_item_id, quantity, subtotal, total_tax)
- **returns** (id, order_id, status, name, created_at, updated_at)
- **return_line_items** (id, return_id, quantity, return_reason, customer_note)

### Customers

- **customers** (id, email, first_name, last_name, phone, state, verified_email, tax_exempt, currency, orders_count, total_spent, created_at, updated_at)
- **customer_addresses** (id, customer_id, first_name, last_name, company, address1, address2, city, province, province_code, country, country_code, zip, phone)
- **customer_tags** (customer_id, tag) — PK: (customer_id, tag)

### Inventory

- **inventory_items** (id, sku, cost, country_code_of_origin, tracked, requires_shipping, created_at, updated_at)
- **inventory_levels** (id, inventory_item_id, location_id, available, quantities, updated_at)
- **locations** (id, name, address1, address2, city, province, province_code, country, country_code, zip, phone, active, legacy, created_at, updated_at)

### B2B

- **companies** (id, name, external_id, note, main_contact_id, created_at, updated_at)
- **company_locations** (id, company_id, name, external_id, phone, locale, created_at, updated_at)
- **company_contacts** (id, company_id, customer_id, is_main_contact, locale, title, created_at, updated_at)
- **catalogs** (id, title, status, created_at, updated_at)

### Subscriptions

- **selling_plan_groups** (id, name, merchant_code, created_at, updated_at)
- **selling_plans** (id, selling_plan_group_id, name, category, created_at, updated_at)
- **selling_plan_group_products** (selling_plan_group_id, product_id) — PK: both columns

### Pricing

- **price_lists** (id, name, currency, catalog_id, created_at, updated_at)
- **gift_cards** (id, code, initial_value, balance, currency, customer_id, order_id, note, disabled_at, expires_on, last_characters, created_at, updated_at)

### Content

- **pages** (id, title, handle, body_html, template_suffix, published_at, created_at, updated_at)
- **blogs** (id, title, handle, created_at, updated_at)
- **articles** (id, blog_id, title, handle, author, body_html, summary_html, tags, published_at, created_at, updated_at)
- **redirects** (id, path, target)

### Markets

- **markets** (id, name, handle, enabled, primary, created_at, updated_at) [if present]
- **shop** (id, name, email, domain, plan_name, currency, timezone, created_at, updated_at) [if present]

### Metafields

- **metafields** (id, owner_id, owner_type, namespace, key, value, type, created_at, updated_at)

### SLAM Meta

- **_slam_meta** (key, value) — contains: `schema_version='3'`, `shop_domain`, `currency`, `timezone`, etc.
- **_slam_tables** (name, schema_version, row_count, synced_at, sync_category) — table introspection
- **sync_metadata** (key, value) — `key='lastSyncedAt'` stores the last sync timestamp

---

## TEMP Views

These 6 views are created at connection open and dropped on close. They are available to `slam_run_query`.

| View | Columns | Description |
|------|---------|-------------|
| `product_sales` | product_id, product_title, vendor, product_type, order_count, units_sold, total_revenue | Revenue and unit sales aggregated per product |
| `variant_stock_health` | variant_id, product_id, variant_title, sku, inventory_quantity, total_available | Stock aggregation per variant across all locations |
| `product_collection_map` | product_id, product_title, collection_id, collection_title, collection_handle | Products-to-collections join via the collects table |
| `price_comparison` | variant_id, product_id, product_title, variant_title, price, compare_at_price, discount_percentage | Prices with computed discount percentage |
| `inventory_by_location` | location_id, location_name, location_active, item_count, total_available | Inventory aggregated by location with location name |
| `customer_lifetime_value` | customer_id, email, first_name, last_name, order_count, total_spent, avg_order_value | Per-customer order count, total spend, and AOV |

---

## Important Notes

### Money columns are TEXT

Shopify stores prices as TEXT strings. Always `CAST(price AS REAL)` before arithmetic:

```sql
SELECT SUM(CAST(total_price AS REAL)) FROM orders WHERE financial_status = 'paid'
```

### Table renames from V3

| V3 name | Gadget name |
|---------|-------------|
| `line_items` | `order_line_items` |
| `discount_applications` | `order_discount_codes` |
| `collection_memberships` | `collects` |

### Tags are normalised tables (not JSON)

Tags are stored in separate tables rather than as JSON arrays:

- Product tags: `product_tags` table (product_id, tag)
- Customer tags: `customer_tags` table (customer_id, tag)
- Collection tags: `collection_tags` table (collection_id, tag)

### What is NOT in Gadget (vs V3)

These V3 tables do not exist in the Gadget schema:

| Missing table | Why |
|---|---|
| `change_log` | No field-level diff tracking |
| `inventory_snapshots` | No historical inventory time-series |
| `price_snapshots` | No historical pricing data |
| `sync_log` | Sync cycle metadata not exposed |

---

## Key Join Paths

| From | Via | To | Note |
|------|-----|----|------|
| `order_line_items.order_id` | | `orders.id` | |
| `order_line_items.product_id` | | `products.id` | |
| `order_line_items.variant_id` | | `variants.id` | |
| `collects.product_id` | | `products.id` | |
| `collects.collection_id` | | `collections.id` | |
| `inventory_levels.inventory_item_id` | | `inventory_items.id` | |
| `inventory_items.id` | | `variants.id` (via inventory_items.sku) | Join on sku or use variant_stock_health view |
| `inventory_levels.location_id` | | `locations.id` | |
| `orders.customer_id` | | `customers.id` | |
| `orders.email` | | `customers.email` | Logical only — no FK declared |
| `fulfillments.order_id` | | `orders.id` | |
| `refunds.order_id` | | `orders.id` | |
| `returns.order_id` | | `orders.id` | |
| `company_contacts.customer_id` | | `customers.id` | B2B contact link |
| `selling_plans.selling_plan_group_id` | | `selling_plan_groups.id` | |
| `selling_plan_group_products.product_id` | | `products.id` | |
| `metafields.owner_id` | `metafields.owner_type` | any entity | owner_type is e.g. 'Product', 'Variant' |

---

## Common Query Patterns

### Revenue for a date range

```sql
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS orders,
  SUM(CAST(total_price AS REAL)) AS revenue
FROM orders
WHERE financial_status = 'paid'
  AND created_at >= '2024-01-01'
  AND created_at < '2024-02-01'
GROUP BY day
ORDER BY day;
```

### Products with no sales

```sql
SELECT p.id, p.title, p.vendor
FROM products p
LEFT JOIN product_sales ps ON ps.product_id = p.id
WHERE ps.product_id IS NULL
  AND p.status = 'ACTIVE';
```

### Stock level per location for a SKU

```sql
SELECT l.name AS location, il.available
FROM inventory_levels il
JOIN inventory_items ii ON ii.id = il.inventory_item_id
JOIN locations l ON l.id = il.location_id
JOIN variants v ON v.sku = ii.sku
WHERE v.sku = 'MY-SKU-001';
```

### Customers with a specific tag

```sql
SELECT c.id, c.email, c.first_name, c.last_name
FROM customers c
JOIN customer_tags ct ON ct.customer_id = c.id
WHERE ct.tag = 'wholesale';
```
