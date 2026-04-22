/**
 * slam_conditions_customers — customer quality checks.
 *
 * Identifies customers with data quality issues using neutral language.
 */

import { getDb } from "../lib/db.js";
import { runChecks, type CheckDef } from "../lib/check-pattern.js";
import { wrapHandler, type ToolDef } from "./index.js";

const CHECKS: CheckDef[] = [
  {
    name: "missing_email",
    description: "Customers where email is null or empty",
    countSql:
      "SELECT COUNT(*) AS cnt FROM customers WHERE email IS NULL OR TRIM(email) = ''",
    sampleSql:
      "SELECT id, first_name, last_name, orders_count, created_at FROM customers WHERE email IS NULL OR TRIM(email) = '' LIMIT ?",
  },
  {
    name: "duplicate_email",
    description:
      "Customer email addresses that appear more than once (case-insensitive)",
    countSql:
      "SELECT COUNT(*) AS cnt FROM (SELECT email FROM customers GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1)",
    sampleSql:
      "SELECT LOWER(TRIM(email)) AS email, COUNT(*) AS occurrences FROM customers GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1 ORDER BY occurrences DESC LIMIT ?",
  },
  {
    name: "zero_orders",
    description: "Customers with no orders in the orders table",
    countSql:
      "SELECT COUNT(*) AS cnt FROM customers c WHERE (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) = 0",
    sampleSql:
      "SELECT id, email, first_name, last_name, created_at FROM customers c WHERE (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) = 0 LIMIT ?",
  },
  {
    name: "zero_total_spent",
    description:
      "Customers with at least one order but zero total spent — possible sync or attribution issue",
    countSql:
      "SELECT COUNT(*) AS cnt FROM customers c WHERE CAST(total_spent AS REAL) = 0 AND (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) > 0",
    sampleSql:
      "SELECT id, email, first_name, last_name, total_spent FROM customers c WHERE CAST(total_spent AS REAL) = 0 AND (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) > 0 LIMIT ?",
  },
];

export const conditionsCustomers: ToolDef = {
  name: "slam_conditions_customers",
  description:
    "Runs customer quality checks: missing email, duplicate emails, zero order count, and customers with orders but zero total spent.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const response = runChecks(db, "conditions", CHECKS);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  }),
};
