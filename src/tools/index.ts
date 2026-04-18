/**
 * Tool barrel export and registration helper.
 *
 * Each tool exports { name, description, schema, handler } conforming to ToolDef.
 * The registerAll() function wires them into an McpServer instance.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import { getDb } from "../lib/db.js";
import { buildColumnHint } from "../lib/query-middleware.js";
import { isSessionInitialized } from "../lib/session.js";

import { slamHealth } from "./slam-health.js";
import { metaStatus } from "./meta-status.js";
import { metaStore } from "./meta-store.js";
import { metaSchema } from "./meta-schema.js";
import { metafieldsQuery } from "./metafields-query.js";
import { productsList } from "./products-list.js";
import { productsGet } from "./products-get.js";
import { productsSearch } from "./products-search.js";
import { productsCount } from "./products-count.js";
import { productImages } from "./product-images.js";
import { variantsList } from "./variants-list.js";
import { variantsGet } from "./variants-get.js";
import { variantsSearch } from "./variants-search.js";
import { variantOptions } from "./variant-options.js";
import { inventoryLevels } from "./inventory-levels.js";
import { inventorySummary } from "./inventory-summary.js";
import { collectionsList } from "./collections-list.js";
import { collectionsGet } from "./collections-get.js";
import { collectionsForProduct } from "./collections-for-product.js";
import { productsForCollection } from "./products-for-collection.js";
import { ordersList } from "./orders-list.js";
import { ordersGet } from "./orders-get.js";
import { ordersSearch } from "./orders-search.js";
import { orderLineItemsList } from "./order-line-items-list.js";
import { discountsSummary } from "./discounts-summary.js";
import { discountsActive } from "./discounts-active.js";
import { fulfillmentTracking } from "./fulfillment-tracking.js";
import { refundsSummary } from "./refunds-summary.js";
import { returnsSummary } from "./returns-summary.js";
import { draftOrdersList } from "./draft-orders-list.js";
import { customersList } from "./customers-list.js";
import { customersGet } from "./customers-get.js";
import { customersByTag } from "./customers-by-tag.js";
import { customersSearch } from "./customers-search.js";
import { customersTop } from "./customers-top.js";
import { customerAddresses } from "./customer-addresses.js";
import { pricesCurrent } from "./prices-current.js";
import { priceAnalysis } from "./price-analysis.js";
import { conditionsContent } from "./conditions-content.js";
import { conditionsPricing } from "./conditions-pricing.js";
import { conditionsIdentifiers } from "./conditions-identifiers.js";
import { conditionsInventory } from "./conditions-inventory.js";
import { conditionsOrders } from "./conditions-orders.js";
import { conditionsCustomers } from "./conditions-customers.js";
import { salesSummary } from "./sales-summary.js";
import { salesByPeriod } from "./sales-by-period.js";
import { productsTop } from "./products-top.js";
import { productsBoughtTogether } from "./products-bought-together.js";
import { vendorsSummary } from "./vendors-summary.js";
import { inventoryAlerts } from "./inventory-alerts.js";
import { inventoryOversold } from "./inventory-oversold.js";
import { inventoryByLocation } from "./inventory-by-location.js";
import { deadStock } from "./dead-stock.js";
import { locationsList } from "./locations-list.js";
import { b2bCompaniesList } from "./b2b-companies-list.js";
import { contentPages } from "./content-pages.js";
import { giftCardsSummary } from "./gift-cards-summary.js";
import { sellingPlansList } from "./selling-plans-list.js";
import { storeSnapshot } from "./store-snapshot.js";
import { runQuery } from "./run-query.js";

// ---------------------------------------------------------------------------
// ToolDef — the shape every tool file exports
// ---------------------------------------------------------------------------

/** Re-export the SDK's CallToolResult as our tool response type. */
export type ToolResponse = CallToolResult;

export interface ToolDef {
  name: string;
  description: string;
  /** Zod raw shape — keys are param names, values are ZodType instances. Empty object for no-param tools. */
  schema: Record<string, z.ZodTypeAny>;
  /** The async handler. Receives parsed params (or none) and returns MCP content. */
  handler: (params?: Record<string, unknown>) => Promise<ToolResponse>;
}

// ---------------------------------------------------------------------------
// wrapHandler — uniform error catching for all tool handlers
// ---------------------------------------------------------------------------

/**
 * Wraps a tool handler with a top-level try/catch.
 * On any thrown error, returns a structured { error, _meta } response
 * instead of propagating the exception into the MCP SDK.
 */
export function wrapHandler(
  handler: (params?: Record<string, unknown>) => Promise<ToolResponse>,
): (params?: Record<string, unknown>) => Promise<ToolResponse> {
  return async (params) => {
    if (!isSessionInitialized()) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "slam_health must be called first. Call slam_health once at the start of each session to initialize the server.",
            session_token_required: true,
            _meta: { domain: "error", output_type: "error" },
          }, null, 2),
        }],
      };
    }
    try {
      return await handler(params);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[slam-mcp] Tool error: ${message}\n`);
      let hint: string | undefined;

      try {
        const { db } = getDb();
        hint = buildColumnHint(db, message);
      } catch { /* db not available */ }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: message,
              ...(hint ? { hint } : {}),
              _meta: { domain: "error", output_type: "error" },
            }, null, 2),
          },
        ],
      };
    }
  };
}

// ---------------------------------------------------------------------------
// All tools in registration order
// ---------------------------------------------------------------------------

export const ALL_TOOLS: ToolDef[] = [
  // Meta
  slamHealth,
  metaStatus,
  metaStore,
  metaSchema,
  metafieldsQuery,
  // Products
  productsList,
  productsGet,
  productsSearch,
  productsCount,
  productImages,
  // Variants
  variantsList,
  variantsGet,
  variantsSearch,
  variantOptions,
  // Inventory
  inventoryLevels,
  inventorySummary,
  inventoryAlerts,
  inventoryOversold,
  inventoryByLocation,
  deadStock,
  // Collections
  collectionsList,
  collectionsGet,
  collectionsForProduct,
  productsForCollection,
  // Orders
  ordersList,
  ordersGet,
  ordersSearch,
  orderLineItemsList,
  discountsSummary,
  discountsActive,
  fulfillmentTracking,
  refundsSummary,
  returnsSummary,
  draftOrdersList,
  // Customers
  customersList,
  customersGet,
  customersByTag,
  customersSearch,
  customersTop,
  customerAddresses,
  // Prices
  pricesCurrent,
  priceAnalysis,
  // Conditions
  conditionsContent,
  conditionsPricing,
  conditionsIdentifiers,
  conditionsInventory,
  conditionsOrders,
  conditionsCustomers,
  // Reporting / dashboard
  salesSummary,
  salesByPeriod,
  productsTop,
  productsBoughtTogether,
  vendorsSummary,
  // Store-level
  locationsList,
  b2bCompaniesList,
  contentPages,
  giftCardsSummary,
  sellingPlansList,
  // Snapshot
  storeSnapshot,
  // Ad-hoc query
  runQuery,
];

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

/**
 * Register all SLAM tools with the given McpServer instance.
 */
export function registerAll(server: McpServer): void {
  for (const tool of ALL_TOOLS) {
    const description = tool.name === "slam_health"
      ? tool.description
      : `[Requires slam_health] ${tool.description}`;

    if (Object.keys(tool.schema).length === 0) {
      // Zero-argument tool
      server.tool(tool.name, description, async () => {
        return tool.handler({});
      });
    } else {
      // Tool with params
      server.tool(tool.name, description, tool.schema, async (params) => {
        return tool.handler(params as Record<string, unknown>);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export {
  slamHealth,
  metaStatus,
  metaStore,
  metaSchema,
  metafieldsQuery,
  productsList,
  productsGet,
  productsSearch,
  productsCount,
  productImages,
  variantsList,
  variantsGet,
  variantsSearch,
  variantOptions,
  inventoryLevels,
  inventorySummary,
  inventoryAlerts,
  inventoryOversold,
  inventoryByLocation,
  deadStock,
  collectionsList,
  collectionsGet,
  collectionsForProduct,
  productsForCollection,
  ordersList,
  ordersGet,
  ordersSearch,
  orderLineItemsList,
  discountsSummary,
  discountsActive,
  fulfillmentTracking,
  refundsSummary,
  returnsSummary,
  draftOrdersList,
  customersList,
  customersGet,
  customersByTag,
  customersSearch,
  customersTop,
  customerAddresses,
  pricesCurrent,
  priceAnalysis,
  conditionsContent,
  conditionsPricing,
  conditionsIdentifiers,
  conditionsInventory,
  conditionsOrders,
  conditionsCustomers,
  salesSummary,
  salesByPeriod,
  productsTop,
  productsBoughtTogether,
  vendorsSummary,
  locationsList,
  b2bCompaniesList,
  contentPages,
  giftCardsSummary,
  sellingPlansList,
  storeSnapshot,
  runQuery,
};
