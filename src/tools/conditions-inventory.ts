/**
 * slam_conditions_inventory — inventory status checks.
 *
 * Identifies variants/items with potential inventory issues using neutral language.
 * Copied verbatim from V3 — uses variant_stock_health view which has correct joins.
 */

import { getDb } from "../lib/db.js";
import { runChecks, type CheckDef } from "../lib/check-pattern.js";
import { wrapHandler, type ToolDef } from "./index.js";

const CHECKS: CheckDef[] = [
  {
    name: "out_of_stock",
    description: "Variants where inventory_quantity is 0",
    countSql:
      "SELECT COUNT(*) AS cnt FROM variants WHERE inventory_quantity = 0",
    sampleSql:
      `SELECT v.id, v.product_id, v.title, v.sku, v.inventory_quantity, p.title AS product_title
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.inventory_quantity = 0 LIMIT ?`,
  },
  {
    name: "negative_inventory",
    description: "Variants where inventory_quantity is negative",
    countSql:
      "SELECT COUNT(*) AS cnt FROM variants WHERE inventory_quantity < 0",
    sampleSql:
      `SELECT v.id, v.product_id, v.title, v.sku, v.inventory_quantity, p.title AS product_title
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.inventory_quantity < 0 LIMIT ?`,
  },
  {
    name: "untracked",
    description: "Inventory items where tracked is false",
    countSql:
      "SELECT COUNT(*) AS cnt FROM inventory_items WHERE tracked = 0",
    sampleSql:
      `SELECT ii.id, ii.variant_id, ii.sku, ii.tracked, v.title AS variant_title
       FROM inventory_items ii
       LEFT JOIN variants v ON v.id = ii.variant_id
       WHERE ii.tracked = 0 LIMIT ?`,
  },
];

export const conditionsInventory: ToolDef = {
  name: "slam_conditions_inventory",
  description:
    "Runs inventory status checks: out-of-stock variants, negative inventory, and untracked inventory items.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const response = runChecks(db, "conditions", CHECKS);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  }),
};
