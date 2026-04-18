/**
 * slam_conditions_pricing — pricing anomaly checks.
 *
 * Identifies variants with potential pricing issues using neutral language.
 */

import { getDb } from "../lib/db.js";
import { runChecks, type CheckDef } from "../lib/check-pattern.js";
import { wrapHandler, type ToolDef } from "./index.js";

const CHECKS: CheckDef[] = [
  {
    name: "price_zero",
    description: "Variants where price is '0' or '0.00'",
    countSql:
      "SELECT COUNT(*) AS cnt FROM variants WHERE price = '0' OR price = '0.00'",
    sampleSql:
      `SELECT v.id, v.product_id, v.title, v.sku, v.price, p.title AS product_title
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.price = '0' OR v.price = '0.00' LIMIT ?`,
  },
  {
    name: "compare_at_inverted",
    description: "Variants where compare_at_price is less than price (inverted sale)",
    countSql:
      `SELECT COUNT(*) AS cnt FROM variants
       WHERE compare_at_price IS NOT NULL
         AND CAST(compare_at_price AS REAL) < CAST(price AS REAL)
         AND CAST(compare_at_price AS REAL) > 0`,
    sampleSql:
      `SELECT v.id, v.product_id, v.title, v.sku, v.price, v.compare_at_price, p.title AS product_title
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.compare_at_price IS NOT NULL
         AND CAST(v.compare_at_price AS REAL) < CAST(v.price AS REAL)
         AND CAST(v.compare_at_price AS REAL) > 0
       LIMIT ?`,
  },
  {
    name: "compare_at_equals_price",
    description: "Variants where compare_at_price equals price (no actual discount)",
    countSql:
      `SELECT COUNT(*) AS cnt FROM variants
       WHERE compare_at_price IS NOT NULL
         AND CAST(compare_at_price AS REAL) = CAST(price AS REAL)`,
    sampleSql:
      `SELECT v.id, v.product_id, v.title, v.sku, v.price, v.compare_at_price, p.title AS product_title
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.compare_at_price IS NOT NULL
         AND CAST(v.compare_at_price AS REAL) = CAST(v.price AS REAL)
       LIMIT ?`,
  },
];

export const conditionsPricing: ToolDef = {
  name: "slam_conditions_pricing",
  description:
    "Runs pricing anomaly checks: zero-price variants, inverted compare_at_price, and compare_at_price equal to price.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const response = runChecks(db, "conditions", CHECKS);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  }),
};
