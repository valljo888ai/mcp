/**
 * slam_conditions_identifiers — identifier completeness checks.
 *
 * Identifies variants/products with potential identifier issues using neutral language.
 */

import { getDb } from "../lib/db.js";
import { runChecks, type CheckDef } from "../lib/check-pattern.js";
import { wrapHandler, type ToolDef } from "./index.js";

const CHECKS: CheckDef[] = [
  {
    name: "sku_empty",
    description: "Variants where SKU is null or empty",
    countSql:
      "SELECT COUNT(*) AS cnt FROM variants WHERE sku IS NULL OR TRIM(sku) = ''",
    sampleSql:
      `SELECT v.id, v.product_id, v.title, v.sku, p.title AS product_title
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.sku IS NULL OR TRIM(v.sku) = '' LIMIT ?`,
  },
  {
    name: "barcode_empty",
    description: "Variants where barcode is null or empty",
    countSql:
      "SELECT COUNT(*) AS cnt FROM variants WHERE barcode IS NULL OR TRIM(barcode) = ''",
    sampleSql:
      `SELECT v.id, v.product_id, v.title, v.sku, v.barcode, p.title AS product_title
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.barcode IS NULL OR TRIM(v.barcode) = '' LIMIT ?`,
  },
  {
    name: "duplicate_titles",
    description: "Products with duplicate titles",
    countSql:
      `SELECT COUNT(*) AS cnt FROM (
         SELECT title FROM products GROUP BY title HAVING COUNT(*) > 1
       ) AS dupes`,
    sampleSql:
      `SELECT p.id, p.title, p.handle, p.status,
              (SELECT COUNT(*) FROM products p2 WHERE p2.title = p.title) AS duplicate_count
       FROM products p
       WHERE p.title IN (SELECT title FROM products GROUP BY title HAVING COUNT(*) > 1)
       ORDER BY p.title
       LIMIT ?`,
  },
];

export const conditionsIdentifiers: ToolDef = {
  name: "slam_conditions_identifiers",
  description:
    "Runs identifier completeness checks: empty SKUs, empty barcodes, and duplicate product titles.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const response = runChecks(db, "conditions", CHECKS);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  }),
};
