/**
 * slam_conditions_orders — order quality checks.
 *
 * Identifies orders with structural or data issues using neutral language.
 *
 * Gadget schema changes from V3:
 *   - line_items             → order_line_items
 *   - discount_applications  → order_discount_codes
 */

import { getDb } from "../lib/db.js";
import { runChecks, type CheckDef } from "../lib/check-pattern.js";
import { wrapHandler, type ToolDef } from "./index.js";

const CHECKS: CheckDef[] = [
  {
    name: "zero_line_items",
    description: "Orders with no associated line items",
    countSql:
      "SELECT COUNT(*) AS cnt FROM orders o LEFT JOIN order_line_items li ON li.order_id = o.id WHERE li.id IS NULL",
    sampleSql:
      "SELECT o.id, o.name, o.email, o.financial_status, o.created_at FROM orders o LEFT JOIN order_line_items li ON li.order_id = o.id WHERE li.id IS NULL LIMIT ?",
  },
  {
    name: "missing_customer_email",
    description: "Orders where customer email is null or empty",
    countSql:
      "SELECT COUNT(*) AS cnt FROM orders WHERE email IS NULL OR TRIM(email) = ''",
    sampleSql:
      "SELECT id, name, financial_status, total_price, created_at FROM orders WHERE email IS NULL OR TRIM(email) = '' LIMIT ?",
  },
  {
    name: "zero_total_price",
    description: "Orders where total price is zero",
    countSql:
      "SELECT COUNT(*) AS cnt FROM orders WHERE CAST(total_price AS REAL) = 0",
    sampleSql:
      "SELECT id, name, email, financial_status, fulfillment_status FROM orders WHERE CAST(total_price AS REAL) = 0 LIMIT ?",
  },
  {
    name: "refunded_unfulfilled",
    description:
      "Orders marked as refunded but still showing as unfulfilled",
    countSql:
      "SELECT COUNT(*) AS cnt FROM orders WHERE financial_status = 'REFUNDED' AND fulfillment_status = 'UNFULFILLED'",
    sampleSql:
      "SELECT id, name, email, total_price, created_at FROM orders WHERE financial_status = 'REFUNDED' AND fulfillment_status = 'UNFULFILLED' LIMIT ?",
  },
];

export const conditionsOrders: ToolDef = {
  name: "slam_conditions_orders",
  description:
    "Runs order quality checks: orders with no line items, missing customer email, zero total price, and refunded-but-unfulfilled status.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const response = runChecks(db, "conditions", CHECKS);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  }),
};
