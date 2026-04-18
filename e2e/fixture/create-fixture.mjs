// Uses better-sqlite3 when available, falls back to Node.js built-in node:sqlite (Node 22.5+)
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "store.db");
mkdirSync(__dirname, { recursive: true });
// Remove existing db so the script is idempotent
rmSync(DB_PATH, { force: true });
rmSync(DB_PATH + "-wal", { force: true });
rmSync(DB_PATH + "-shm", { force: true });

let db;
try {
  const { default: Database } = await import("better-sqlite3");
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");
} catch {
  // Fallback: Node.js 22.5+ built-in sqlite (no native compile needed)
  const { DatabaseSync } = await import("node:sqlite");
  const raw = new DatabaseSync(DB_PATH);
  // Wrap to match better-sqlite3 interface used below
  db = {
    pragma: () => {},
    prepare: (sql) => ({
      run: (...args) => raw.prepare(sql).run(...args),
    }),
    transaction: (fn) => fn,
    exec: (sql) => raw.exec(sql),
    close: () => raw.close(),
  };
  raw.exec("PRAGMA journal_mode = WAL");
  raw.exec("PRAGMA foreign_keys = OFF");
}

// Schema — Gadget sqliteSchema.ts SCHEMA_VERSION = 3
// Each CREATE is run individually so errors are easy to locate
const TABLES = [
  "CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, title TEXT, body_html TEXT, handle TEXT, product_type TEXT, vendor TEXT, status TEXT, tags TEXT, category TEXT, template_suffix TEXT, published_at TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS variants (id TEXT PRIMARY KEY, product_id TEXT, title TEXT, sku TEXT, barcode TEXT, price TEXT, compare_at_price TEXT, inventory_quantity INTEGER, inventory_policy TEXT, option1 TEXT, option2 TEXT, option3 TEXT, position INTEGER, taxable INTEGER, available_for_sale INTEGER, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS product_options (id TEXT PRIMARY KEY, product_id TEXT, name TEXT, position INTEGER, option_values TEXT)",
  "CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, title TEXT, handle TEXT, body_html TEXT, collection_type TEXT, sort_order TEXT, rules TEXT, published_at TEXT, published_scope TEXT, template_suffix TEXT, image_url TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS collects (id TEXT PRIMARY KEY, product_id TEXT, collection_id TEXT, position INTEGER, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS product_media (id TEXT PRIMARY KEY, product_id TEXT, media_content_type TEXT, alt TEXT, status TEXT, position INTEGER, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS product_tags (product_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(product_id, tag))",
  "CREATE TABLE IF NOT EXISTS collection_tags (collection_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(collection_id, tag))",
  "CREATE TABLE IF NOT EXISTS inventory_items (id TEXT PRIMARY KEY, sku TEXT, cost TEXT, country_code_of_origin TEXT, province_code_of_origin TEXT, harmonized_system_code TEXT, tracked INTEGER, requires_shipping INTEGER, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS inventory_levels (id TEXT PRIMARY KEY, inventory_item_id TEXT, location_id TEXT, available INTEGER, quantities TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY, name TEXT, address1 TEXT, address2 TEXT, city TEXT, province TEXT, province_code TEXT, country TEXT, country_code TEXT, zip TEXT, phone TEXT, active INTEGER, legacy INTEGER, localized_country_name TEXT, localized_province_name TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, customer_id TEXT, financial_status TEXT, fulfillment_status TEXT, cancel_reason TEXT, cancelled_at TEXT, closed_at TEXT, processed_at TEXT, currency TEXT, total_price TEXT, subtotal_price TEXT, total_tax TEXT, total_discounts TEXT, total_shipping TEXT, total_weight INTEGER, taxes_included INTEGER, tax_exempt INTEGER, discount_codes TEXT, shipping_lines TEXT, note TEXT, tags TEXT, source_name TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS order_line_items (id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT, variant_id TEXT, title TEXT, variant_title TEXT, name TEXT, sku TEXT, quantity INTEGER, price TEXT, total_discount TEXT, vendor TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS draft_orders (id TEXT PRIMARY KEY, name TEXT, status TEXT, email TEXT, customer_id TEXT, order_id TEXT, currency TEXT, subtotal_price TEXT, total_price TEXT, total_tax TEXT, note TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS draft_order_line_items (id TEXT PRIMARY KEY, draft_order_id TEXT, product_id TEXT, variant_id TEXT, title TEXT, variant_title TEXT, sku TEXT, quantity INTEGER, price TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS order_tags (order_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(order_id, tag))",
  "CREATE TABLE IF NOT EXISTS refunds (id TEXT PRIMARY KEY, order_id TEXT, note TEXT, created_at TEXT, processed_at TEXT)",
  "CREATE TABLE IF NOT EXISTS refund_line_items (id TEXT PRIMARY KEY, refund_id TEXT, order_line_item_id TEXT, quantity INTEGER, subtotal TEXT, total_tax TEXT)",
  "CREATE TABLE IF NOT EXISTS order_transactions (id TEXT PRIMARY KEY, order_id TEXT, parent_id TEXT, kind TEXT, gateway TEXT, status TEXT, amount TEXT, currency TEXT, authorization TEXT, error_code TEXT, test INTEGER, created_at TEXT, processed_at TEXT)",
  "CREATE TABLE IF NOT EXISTS gift_cards (id TEXT PRIMARY KEY, code TEXT, initial_value TEXT, balance TEXT, currency TEXT, customer_id TEXT, order_id TEXT, note TEXT, disabled_at TEXT, expires_on TEXT, last_characters TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS order_discount_codes (order_id TEXT NOT NULL, code TEXT NOT NULL, amount TEXT, type TEXT, PRIMARY KEY(order_id, code))",
  "CREATE TABLE IF NOT EXISTS order_shipping_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, title TEXT, code TEXT, source TEXT, price TEXT, discounted_price TEXT, carrier_identifier TEXT)",
  "CREATE TABLE IF NOT EXISTS fulfillments (id TEXT PRIMARY KEY, order_id TEXT, location_id TEXT, status TEXT, tracking_company TEXT, tracking_numbers TEXT, tracking_urls TEXT, shipment_status TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS fulfillment_orders (id TEXT PRIMARY KEY, order_id TEXT, assigned_location_id TEXT, status TEXT, request_status TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS fulfillment_order_line_items (id TEXT PRIMARY KEY, fulfillment_order_id TEXT, variant_id TEXT, inventory_item_id TEXT, quantity INTEGER, remaining_quantity INTEGER)",
  "CREATE TABLE IF NOT EXISTS returns (id TEXT PRIMARY KEY, order_id TEXT, status TEXT, name TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS return_line_items (id TEXT PRIMARY KEY, return_id TEXT, quantity INTEGER, return_reason TEXT, customer_note TEXT)",
  "CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, email TEXT, first_name TEXT, last_name TEXT, phone TEXT, state TEXT, verified_email INTEGER, tax_exempt INTEGER, currency TEXT, note TEXT, tags TEXT, orders_count INTEGER, total_spent TEXT, total_spent_currency TEXT, last_order_id TEXT, market_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS customer_addresses (id TEXT PRIMARY KEY, customer_id TEXT, first_name TEXT, last_name TEXT, company TEXT, address1 TEXT, address2 TEXT, city TEXT, province TEXT, province_code TEXT, country TEXT, country_code TEXT, zip TEXT, phone TEXT)",
  "CREATE TABLE IF NOT EXISTS customer_tags (customer_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(customer_id, tag))",
  "CREATE TABLE IF NOT EXISTS discounts (id TEXT PRIMARY KEY, title TEXT, status TEXT, starts_at TEXT, ends_at TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS price_lists (id TEXT PRIMARY KEY, name TEXT, currency TEXT, catalog_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, title TEXT, handle TEXT, body_html TEXT, template_suffix TEXT, published_at TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS blogs (id TEXT PRIMARY KEY, title TEXT, handle TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, blog_id TEXT, title TEXT, handle TEXT, author TEXT, body_html TEXT, summary_html TEXT, tags TEXT, published_at TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS redirects (id TEXT PRIMARY KEY, path TEXT, target TEXT)",
  "CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT, external_id TEXT, note TEXT, main_contact_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS company_locations (id TEXT PRIMARY KEY, company_id TEXT, name TEXT, external_id TEXT, phone TEXT, locale TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS company_contacts (id TEXT PRIMARY KEY, company_id TEXT, customer_id TEXT, is_main_contact INTEGER, locale TEXT, title TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS catalogs (id TEXT PRIMARY KEY, title TEXT, status TEXT, price_list_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS shop (id TEXT PRIMARY KEY, name TEXT, domain TEXT, myshopify_domain TEXT, email TEXT, phone TEXT, address1 TEXT, address2 TEXT, city TEXT, province TEXT, province_code TEXT, country TEXT, country_code TEXT, zip TEXT, currency TEXT, iana_timezone TEXT, plan_name TEXT, plan_display_name TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS markets (id TEXT PRIMARY KEY, name TEXT, handle TEXT, enabled INTEGER, primary_market INTEGER, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS selling_plan_groups (id TEXT PRIMARY KEY, name TEXT, merchant_code TEXT, summary TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS selling_plans (id TEXT PRIMARY KEY, selling_plan_group_id TEXT, name TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS selling_plan_group_products (id TEXT PRIMARY KEY, selling_plan_group_id TEXT, product_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS selling_plan_group_product_variants (id TEXT PRIMARY KEY, selling_plan_group_id TEXT, product_variant_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS metafields (id TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, namespace TEXT, key TEXT, value TEXT, type TEXT, description TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS _slam_meta (schema_version TEXT, slam_version TEXT, export_timestamp TEXT, export_duration_ms INTEGER, store_name TEXT, store_domain TEXT, store_myshopify_domain TEXT, store_currency TEXT, store_timezone TEXT, store_plan TEXT, store_country TEXT, total_tables INTEGER, total_records INTEGER, includes_metafields INTEGER, shopify_api_version TEXT)",
  "CREATE TABLE IF NOT EXISTS _slam_tables (table_name TEXT PRIMARY KEY, description TEXT, source TEXT, shopify_model TEXT, category TEXT, record_count INTEGER, primary_key TEXT, is_derived INTEGER, is_join_table INTEGER)",
  "CREATE TABLE IF NOT EXISTS _slam_relationships (from_table TEXT NOT NULL, from_column TEXT NOT NULL, to_table TEXT, to_column TEXT, relationship_type TEXT, description TEXT, PRIMARY KEY(from_table, from_column))",
  "CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT)",
  "CREATE TABLE IF NOT EXISTS export_history (id INTEGER PRIMARY KEY AUTOINCREMENT, exported_at TEXT NOT NULL, file_size_bytes INTEGER NOT NULL, total_records INTEGER, filename TEXT)",
];
for (const sql of TABLES) db.prepare(sql).run();

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id)",
  "CREATE INDEX IF NOT EXISTS idx_product_options_product_id ON product_options(product_id)",
  "CREATE INDEX IF NOT EXISTS idx_collects_product_id ON collects(product_id)",
  "CREATE INDEX IF NOT EXISTS idx_collects_collection_id ON collects(collection_id)",
  "CREATE INDEX IF NOT EXISTS idx_product_media_product_id ON product_media(product_id)",
  "CREATE INDEX IF NOT EXISTS idx_product_tags_tag ON product_tags(tag)",
  "CREATE INDEX IF NOT EXISTS idx_inventory_levels_item ON inventory_levels(inventory_item_id)",
  "CREATE INDEX IF NOT EXISTS idx_inventory_levels_loc ON inventory_levels(location_id)",
  "CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)",
  "CREATE INDEX IF NOT EXISTS idx_orders_fin ON orders(financial_status)",
  "CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_oli_order ON order_line_items(order_id)",
  "CREATE INDEX IF NOT EXISTS idx_oli_product ON order_line_items(product_id)",
  "CREATE INDEX IF NOT EXISTS idx_oli_variant ON order_line_items(variant_id)",
  "CREATE INDEX IF NOT EXISTS idx_do_customer ON draft_orders(customer_id)",
  "CREATE INDEX IF NOT EXISTS idx_doli_do ON draft_order_line_items(draft_order_id)",
  "CREATE INDEX IF NOT EXISTS idx_ot_tag ON order_tags(tag)",
  "CREATE INDEX IF NOT EXISTS idx_ref_order ON refunds(order_id)",
  "CREATE INDEX IF NOT EXISTS idx_rli_refund ON refund_line_items(refund_id)",
  "CREATE INDEX IF NOT EXISTS idx_otx_order ON order_transactions(order_id)",
  "CREATE INDEX IF NOT EXISTS idx_gc_customer ON gift_cards(customer_id)",
  "CREATE INDEX IF NOT EXISTS idx_odc_code ON order_discount_codes(code)",
  "CREATE INDEX IF NOT EXISTS idx_osl_order ON order_shipping_lines(order_id)",
  "CREATE INDEX IF NOT EXISTS idx_ful_order ON fulfillments(order_id)",
  "CREATE INDEX IF NOT EXISTS idx_fo_order ON fulfillment_orders(order_id)",
  "CREATE INDEX IF NOT EXISTS idx_foli_fo ON fulfillment_order_line_items(fulfillment_order_id)",
  "CREATE INDEX IF NOT EXISTS idx_ret_order ON returns(order_id)",
  "CREATE INDEX IF NOT EXISTS idx_retli_ret ON return_line_items(return_id)",
  "CREATE INDEX IF NOT EXISTS idx_ca_customer ON customer_addresses(customer_id)",
  "CREATE INDEX IF NOT EXISTS idx_ct_tag ON customer_tags(tag)",
  "CREATE INDEX IF NOT EXISTS idx_art_blog ON articles(blog_id)",
  "CREATE INDEX IF NOT EXISTS idx_cl_company ON company_locations(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_cc_company ON company_contacts(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_sp_group ON selling_plans(selling_plan_group_id)",
  "CREATE INDEX IF NOT EXISTS idx_spgp_group ON selling_plan_group_products(selling_plan_group_id)",
  "CREATE INDEX IF NOT EXISTS idx_spgp_product ON selling_plan_group_products(product_id)",
  "CREATE INDEX IF NOT EXISTS idx_spgpv_group ON selling_plan_group_product_variants(selling_plan_group_id)",
  "CREATE INDEX IF NOT EXISTS idx_mf_owner ON metafields(owner_type, owner_id)",
  "CREATE INDEX IF NOT EXISTS idx_mf_ns_key ON metafields(namespace, key)",
  "CREATE INDEX IF NOT EXISTS idx_mf_owner_type ON metafields(owner_type)",
  "CREATE INDEX IF NOT EXISTS idx_eh_exported_at ON export_history(exported_at)",
];
for (const sql of INDEXES) db.prepare(sql).run();

const NOW = new Date().toISOString();

const seed = db.transaction(() => {
  // _slam_meta
  db.prepare("INSERT INTO _slam_meta (schema_version,slam_version,export_timestamp,store_name,store_domain,store_myshopify_domain,store_currency,store_timezone,store_plan,store_country,total_tables,total_records,includes_metafields,shopify_api_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("3","2.0.0",NOW,"Test Store","teststore.myshopify.com","teststore.myshopify.com","AUD","Australia/Melbourne","basic","AU",40,100,1,"2024-01");

  // _slam_tables
  const ti = db.prepare("INSERT OR IGNORE INTO _slam_tables (table_name,description,source,shopify_model,category,record_count,primary_key,is_derived,is_join_table) VALUES (?,?,?,?,?,?,?,?,?)");
  [
    ["products","Shopify products","shopify","Product","catalog",1,"id",0,0],
    ["variants","Product variants","shopify","ProductVariant","catalog",1,"id",0,0],
    ["product_options","Product options","shopify","ProductOption","catalog",1,"id",0,0],
    ["collections","Collections","shopify","Collection","catalog",1,"id",0,0],
    ["collects","Collects","shopify","Collect","catalog",1,"id",0,1],
    ["product_media","Product media","shopify","Media","catalog",1,"id",0,0],
    ["product_tags","Product tags","shopify","Product","catalog",1,"product_id,tag",0,1],
    ["collection_tags","Collection tags","shopify","Collection","catalog",0,"collection_id,tag",0,1],
    ["inventory_items","Inventory items","shopify","InventoryItem","inventory",1,"id",0,0],
    ["inventory_levels","Inventory levels","shopify","InventoryLevel","inventory",1,"id",0,0],
    ["locations","Locations","shopify","Location","inventory",1,"id",0,0],
    ["orders","Orders","shopify","Order","orders",1,"id",0,0],
    ["order_line_items","Order line items","shopify","LineItem","orders",1,"id",0,0],
    ["order_tags","Order tags","shopify","Order","orders",1,"order_id,tag",0,1],
    ["order_discount_codes","Order discount codes","shopify","DiscountCode","orders",1,"order_id,code",0,1],
    ["order_shipping_lines","Order shipping lines","shopify","ShippingLine","orders",1,"id",0,0],
    ["draft_orders","Draft orders","shopify","DraftOrder","orders",1,"id",0,0],
    ["draft_order_line_items","Draft order line items","shopify","DraftOrderLineItem","orders",1,"id",0,0],
    ["refunds","Refunds","shopify","Refund","orders",1,"id",0,0],
    ["refund_line_items","Refund line items","shopify","RefundLineItem","orders",1,"id",0,0],
    ["order_transactions","Order transactions","shopify","Transaction","orders",0,"id",0,0],
    ["fulfillments","Fulfillments","shopify","Fulfillment","fulfillment",1,"id",0,0],
    ["fulfillment_orders","Fulfillment orders","shopify","FulfillmentOrder","fulfillment",1,"id",0,0],
    ["fulfillment_order_line_items","Fulfillment order line items","shopify","FulfillmentOrderLineItem","fulfillment",1,"id",0,0],
    ["returns","Returns","shopify","Return","returns",1,"id",0,0],
    ["return_line_items","Return line items","shopify","ReturnLineItem","returns",1,"id",0,0],
    ["customers","Customers","shopify","Customer","customers",1,"id",0,0],
    ["customer_addresses","Customer addresses","shopify","MailingAddress","customers",1,"id",0,0],
    ["customer_tags","Customer tags","shopify","Customer","customers",1,"customer_id,tag",0,1],
    ["gift_cards","Gift cards","shopify","GiftCard","payments",1,"id",0,0],
    ["discounts","Discounts","shopify","DiscountNode","discounts",1,"id",0,0],
    ["price_lists","Price lists","shopify","PriceList","b2b",1,"id",0,0],
    ["pages","Pages","shopify","Page","content",1,"id",0,0],
    ["blogs","Blogs","shopify","Blog","content",1,"id",0,0],
    ["articles","Articles","shopify","Article","content",1,"id",0,0],
    ["redirects","Redirects","shopify","UrlRedirect","content",0,"id",0,0],
    ["companies","Companies","shopify","Company","b2b",1,"id",0,0],
    ["company_locations","Company locations","shopify","CompanyLocation","b2b",1,"id",0,0],
    ["company_contacts","Company contacts","shopify","CompanyContact","b2b",1,"id",0,0],
    ["catalogs","Catalogs","shopify","Catalog","b2b",0,"id",0,0],
    ["shop","Shop settings","shopify","Shop","settings",1,"id",0,0],
    ["markets","Markets","shopify","Market","settings",1,"id",0,0],
    ["selling_plan_groups","Selling plan groups","shopify","SellingPlanGroup","subscriptions",1,"id",0,0],
    ["selling_plans","Selling plans","shopify","SellingPlan","subscriptions",1,"id",0,0],
    ["selling_plan_group_products","Selling plan group products","shopify","SellingPlanGroup","subscriptions",1,"id",0,1],
    ["selling_plan_group_product_variants","Selling plan group variants","shopify","SellingPlanGroup","subscriptions",0,"id",0,1],
    ["metafields","Metafields","shopify","Metafield","meta",1,"id",0,0],
    ["_slam_meta","SLAM metadata","slam",null,"internal",1,null,0,0],
    ["_slam_tables","SLAM table registry","slam",null,"internal",48,"table_name",0,0],
    ["_slam_relationships","SLAM relationships","slam",null,"internal",0,"from_table,from_column",0,0],
    ["sync_metadata","Sync metadata","slam",null,"internal",1,"key",0,0],
    ["export_history","Export history","slam",null,"internal",1,"id",0,0],
  ].forEach(r => ti.run(...r));

  // sync_metadata
  db.prepare("INSERT INTO sync_metadata (key,value) VALUES (?,?)")
    .run("lastSyncedAt", new Date(Date.now() - 300000).toISOString());

  // export_history
  db.prepare("INSERT INTO export_history (exported_at,file_size_bytes,total_records,filename) VALUES (?,?,?,?)")
    .run(NOW, 204800, 100, "store-export.db");

  // locations
  db.prepare("INSERT INTO locations (id,name,address1,city,province,province_code,country,country_code,zip,active,legacy,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("loc_1","Main Warehouse","123 Test St","Melbourne","Victoria","VIC","Australia","AU","3000",1,0,NOW,NOW);

  // shop
  db.prepare("INSERT INTO shop (id,name,domain,myshopify_domain,email,currency,iana_timezone,plan_name,plan_display_name,country,country_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("shop_1","Test Store","teststore.myshopify.com","teststore.myshopify.com","owner@teststore.com","AUD","Australia/Melbourne","basic","Basic","Australia","AU",NOW,NOW);

  // markets
  db.prepare("INSERT INTO markets (id,name,handle,enabled,primary_market,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("mkt_1","Australia","australia",1,1,NOW,NOW);

  // products
  db.prepare("INSERT INTO products (id,title,handle,product_type,vendor,status,tags,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("prod_1","Test Product","test-product","Widget","Test Vendor","active","bestseller",NOW,NOW,NOW);

  // variants
  db.prepare("INSERT INTO variants (id,product_id,title,sku,price,compare_at_price,inventory_quantity,option1,position,taxable,available_for_sale,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("var_1","prod_1","Default Title","TEST-SKU-1","29.99","39.99",100,"Medium",1,1,1,NOW,NOW);

  // product_options
  db.prepare("INSERT INTO product_options (id,product_id,name,position,option_values) VALUES (?,?,?,?,?)")
    .run("opt_1","prod_1","Size",1,JSON.stringify(["Small","Medium","Large"]));

  // product_media
  db.prepare("INSERT INTO product_media (id,product_id,media_content_type,alt,status,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("media_1","prod_1","IMAGE","Test image","READY",1,NOW,NOW);

  // product_tags
  db.prepare("INSERT INTO product_tags (product_id,tag) VALUES (?,?)").run("prod_1","bestseller");

  // collections
  db.prepare("INSERT INTO collections (id,title,handle,sort_order,collection_type,updated_at) VALUES (?,?,?,?,?,?)")
    .run("coll_1","Featured","featured","best-selling","custom",NOW);

  // collects
  db.prepare("INSERT INTO collects (id,product_id,collection_id,position,created_at) VALUES (?,?,?,?,?)")
    .run("col_1","prod_1","coll_1",1,NOW);

  // collection_tags
  db.prepare("INSERT INTO collection_tags (collection_id,tag) VALUES (?,?)").run("coll_1","featured");

  // customers
  db.prepare("INSERT INTO customers (id,email,first_name,last_name,state,verified_email,orders_count,total_spent,total_spent_currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run("cust_1","customer@test.com","Jane","Doe","enabled",1,1,"29.99","AUD",NOW,NOW);

  // customer_addresses
  db.prepare("INSERT INTO customer_addresses (id,customer_id,first_name,last_name,address1,city,province,province_code,country,country_code,zip) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run("addr_1","cust_1","Jane","Doe","123 Test St","Melbourne","Victoria","VIC","Australia","AU","3000");

  // customer_tags
  db.prepare("INSERT INTO customer_tags (customer_id,tag) VALUES (?,?)").run("cust_1","vip");

  // orders
  db.prepare("INSERT INTO orders (id,name,email,customer_id,financial_status,fulfillment_status,currency,total_price,subtotal_price,total_tax,total_discounts,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("ord_1","#1001","customer@test.com","cust_1","paid","fulfilled","AUD","29.99","27.26","2.73","0.00",NOW,NOW);

  // order_tags
  db.prepare("INSERT INTO order_tags (order_id,tag) VALUES (?,?)").run("ord_1","vip");

  // order_line_items
  db.prepare("INSERT INTO order_line_items (id,order_id,product_id,variant_id,title,variant_title,name,sku,quantity,price,total_discount,vendor,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("li_1","ord_1","prod_1","var_1","Test Product","Default Title","Test Product - Default Title","TEST-SKU-1",1,"29.99","0.00","Test Vendor",NOW,NOW);

  // order_discount_codes
  db.prepare("INSERT INTO order_discount_codes (order_id,code,amount,type) VALUES (?,?,?,?)")
    .run("ord_1","SAVE10","3.00","percentage");

  // order_shipping_lines
  db.prepare("INSERT INTO order_shipping_lines (order_id,title,code,source,price,discounted_price) VALUES (?,?,?,?,?,?)")
    .run("ord_1","Standard Shipping","STANDARD","shopify","9.95","9.95");

  // draft_orders
  db.prepare("INSERT INTO draft_orders (id,name,status,email,customer_id,currency,subtotal_price,total_price,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("draft_1","#D001","open","customer@test.com","cust_1","AUD","27.26","29.99",NOW,NOW);

  // draft_order_line_items
  db.prepare("INSERT INTO draft_order_line_items (id,draft_order_id,product_id,variant_id,title,variant_title,sku,quantity,price,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run("dli_1","draft_1","prod_1","var_1","Test Product","Default Title","TEST-SKU-1",1,"29.99",NOW,NOW);

  // inventory_items
  db.prepare("INSERT INTO inventory_items (id,sku,tracked,requires_shipping,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("invitem_1","TEST-SKU-1",1,1,NOW,NOW);

  // inventory_levels
  db.prepare("INSERT INTO inventory_levels (id,inventory_item_id,location_id,available,quantities,updated_at) VALUES (?,?,?,?,?,?)")
    .run("invlev_1","invitem_1","loc_1",100,JSON.stringify({available:100,on_hand:100,reserved:0,committed:0}),NOW);

  // fulfillments
  db.prepare("INSERT INTO fulfillments (id,order_id,location_id,status,tracking_company,tracking_numbers,tracking_urls,shipment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("ful_1","ord_1","loc_1","success","Australia Post","[]","[]","delivered",NOW,NOW);

  // fulfillment_orders
  db.prepare("INSERT INTO fulfillment_orders (id,order_id,assigned_location_id,status,request_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("fo_1","ord_1","loc_1","closed","accepted",NOW,NOW);

  // fulfillment_order_line_items
  db.prepare("INSERT INTO fulfillment_order_line_items (id,fulfillment_order_id,variant_id,inventory_item_id,quantity,remaining_quantity) VALUES (?,?,?,?,?,?)")
    .run("foli_1","fo_1","var_1","invitem_1",1,0);

  // refunds
  db.prepare("INSERT INTO refunds (id,order_id,note,created_at,processed_at) VALUES (?,?,?,?,?)")
    .run("ref_1","ord_1","Customer request",NOW,NOW);

  // refund_line_items
  db.prepare("INSERT INTO refund_line_items (id,refund_id,order_line_item_id,quantity,subtotal,total_tax) VALUES (?,?,?,?,?,?)")
    .run("rli_1","ref_1","li_1",1,"29.99","2.73");

  // order_transactions
  db.prepare("INSERT INTO order_transactions (id,order_id,kind,gateway,status,amount,currency,test,created_at,processed_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("tx_1","ord_1","sale","shopify_payments","success","29.99","AUD",0,NOW,NOW);

  // returns
  db.prepare("INSERT INTO returns (id,order_id,status,name,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("ret_1","ord_1","OPEN","Return #1",NOW,NOW);

  // return_line_items
  db.prepare("INSERT INTO return_line_items (id,return_id,quantity,return_reason,customer_note) VALUES (?,?,?,?,?)")
    .run("retli_1","ret_1",1,"UNWANTED","Changed my mind");

  // gift_cards
  db.prepare("INSERT INTO gift_cards (id,code,initial_value,balance,currency,customer_id,last_characters,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run("gc_1","GIFT-XXXX-YYYY-1234","50.00","50.00","AUD","cust_1","1234",NOW,NOW);

  // discounts
  db.prepare("INSERT INTO discounts (id,title,status,starts_at,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("disc_1","Summer Sale","ACTIVE",NOW,NOW,NOW);

  // price_lists
  db.prepare("INSERT INTO price_lists (id,name,currency,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("pl_1","Wholesale AUD","AUD",NOW,NOW);

  // pages
  db.prepare("INSERT INTO pages (id,title,handle,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("page_1","About Us","about-us",NOW,NOW,NOW);

  // blogs
  db.prepare("INSERT INTO blogs (id,title,handle,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("blog_1","News","news",NOW,NOW);

  // articles
  db.prepare("INSERT INTO articles (id,blog_id,title,handle,author,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("art_1","blog_1","First Article","first-article","Jane Doe",NOW,NOW,NOW);

  // redirects
  db.prepare("INSERT INTO redirects (id,path,target) VALUES (?,?,?)").run("red_1","/old-page","/about-us");

  // companies
  db.prepare("INSERT INTO companies (id,name,external_id,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("comp_1","Acme Corp","ext_1",NOW,NOW);

  // company_locations
  db.prepare("INSERT INTO company_locations (id,company_id,name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("cloc_1","comp_1","HQ",NOW,NOW);

  // company_contacts
  db.prepare("INSERT INTO company_contacts (id,company_id,customer_id,is_main_contact,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("ccon_1","comp_1","cust_1",1,NOW,NOW);

  // catalogs
  db.prepare("INSERT INTO catalogs (id,title,status,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("cat_1","Wholesale Catalog","active",NOW,NOW);

  // selling_plan_groups
  db.prepare("INSERT INTO selling_plan_groups (id,name,merchant_code,summary,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("spg_1","Monthly Plan","monthly","Subscribe and save monthly",NOW,NOW);

  // selling_plans
  db.prepare("INSERT INTO selling_plans (id,selling_plan_group_id,name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("sp_1","spg_1","Monthly",NOW,NOW);

  // selling_plan_group_products
  db.prepare("INSERT INTO selling_plan_group_products (id,selling_plan_group_id,product_id,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("spgp_1","spg_1","prod_1",NOW,NOW);

  // selling_plan_group_product_variants
  db.prepare("INSERT INTO selling_plan_group_product_variants (id,selling_plan_group_id,product_variant_id,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("spgpv_1","spg_1","var_1",NOW,NOW);

  // metafields
  db.prepare("INSERT INTO metafields (id,owner_type,owner_id,namespace,key,value,type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run("mf_1","PRODUCT","prod_1","custom","material","cotton","single_line_text_field",NOW,NOW);
});

seed();
db.close();
console.log("Fixture written to e2e/fixture/store.db");
