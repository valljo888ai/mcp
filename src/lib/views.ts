import type Database from "better-sqlite3";

export function createViews(db: Database.Database): void {
  // 1. product_sales — joins order_line_items (Gadget name)
  db.exec(
    "CREATE TEMP VIEW IF NOT EXISTS product_sales AS " +
    "SELECT " +
    "  p.id            AS product_id, " +
    "  p.title         AS product_title, " +
    "  p.vendor, " +
    "  p.product_type, " +
    "  COUNT(DISTINCT li.order_id) AS order_count, " +
    "  SUM(li.quantity)            AS units_sold, " +
    "  SUM(CAST(li.price AS REAL) * li.quantity) AS total_revenue " +
    "FROM products p " +
    "LEFT JOIN order_line_items li ON li.product_id = p.id " +
    "GROUP BY p.id;"
  );

  // 2. variant_stock_health — Gadget inventory_levels only has 'available' (no on_hand/reserved cols)
  db.exec(
    "CREATE TEMP VIEW IF NOT EXISTS variant_stock_health AS " +
    "SELECT " +
    "  v.id              AS variant_id, " +
    "  v.product_id, " +
    "  v.title           AS variant_title, " +
    "  v.sku, " +
    "  v.inventory_quantity, " +
    "  COALESCE(SUM(il.available), 0) AS total_available " +
    "FROM variants v " +
    "LEFT JOIN inventory_items ii ON ii.variant_id = v.id " +
    "LEFT JOIN inventory_levels il ON il.inventory_item_id = ii.id " +
    "GROUP BY v.id;"
  );

  // 3. product_collection_map — collects replaces collection_memberships
  db.exec(
    "CREATE TEMP VIEW IF NOT EXISTS product_collection_map AS " +
    "SELECT " +
    "  c2.product_id, " +
    "  p.title   AS product_title, " +
    "  c2.collection_id, " +
    "  c.title   AS collection_title, " +
    "  c.handle  AS collection_handle " +
    "FROM collects c2 " +
    "JOIN products p    ON p.id = c2.product_id " +
    "JOIN collections c ON c.id = c2.collection_id;"
  );

  // 4. price_comparison — unchanged from V3
  db.exec(
    "CREATE TEMP VIEW IF NOT EXISTS price_comparison AS " +
    "SELECT " +
    "  v.id          AS variant_id, " +
    "  v.product_id, " +
    "  p.title       AS product_title, " +
    "  v.title       AS variant_title, " +
    "  v.price, " +
    "  v.compare_at_price, " +
    "  CASE " +
    "    WHEN v.compare_at_price IS NOT NULL " +
    "         AND CAST(v.compare_at_price AS REAL) > CAST(v.price AS REAL) " +
    "    THEN ROUND( " +
    "      (CAST(v.compare_at_price AS REAL) - CAST(v.price AS REAL)) " +
    "      / CAST(v.compare_at_price AS REAL) * 100, 2 " +
    "    ) " +
    "    ELSE 0 " +
    "  END AS discount_percentage " +
    "FROM variants v " +
    "JOIN products p ON p.id = v.product_id;"
  );

  // 5. inventory_by_location — Gadget inventory_levels only has 'available' column
  db.exec(
    "CREATE TEMP VIEW IF NOT EXISTS inventory_by_location AS " +
    "SELECT " +
    "  il.location_id, " +
    "  l.name                                    AS location_name, " +
    "  l.active                                  AS location_active, " +
    "  COUNT(DISTINCT il.inventory_item_id)       AS item_count, " +
    "  COALESCE(SUM(il.available), 0)            AS total_available " +
    "FROM inventory_levels il " +
    "LEFT JOIN locations l ON l.id = il.location_id " +
    "GROUP BY il.location_id;"
  );

  // 6. customer_lifetime_value — new in Gadget (orders.customer_id is a real FK)
  db.exec(
    "CREATE TEMP VIEW IF NOT EXISTS customer_lifetime_value AS " +
    "SELECT " +
    "  c.id            AS customer_id, " +
    "  c.email, " +
    "  c.first_name, " +
    "  c.last_name, " +
    "  COUNT(DISTINCT o.id)                              AS order_count, " +
    "  COALESCE(SUM(CAST(o.total_price AS REAL)), 0)    AS total_spent, " +
    "  CASE COUNT(DISTINCT o.id) " +
    "    WHEN 0 THEN 0 " +
    "    ELSE ROUND( " +
    "      COALESCE(SUM(CAST(o.total_price AS REAL)), 0) / COUNT(DISTINCT o.id), " +
    "      2 " +
    "    ) " +
    "  END AS avg_order_value " +
    "FROM customers c " +
    "LEFT JOIN orders o ON o.customer_id = c.id AND o.financial_status = 'paid' " +
    "GROUP BY c.id;"
  );
}
