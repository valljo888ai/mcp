/**
 * slam_conditions_content — content quality checks.
 *
 * Identifies products with potential content issues using neutral language.
 *
 * Gadget schema: tags are stored in product_tags table (not a text column on products).
 */

import { getDb } from "../lib/db.js";
import { runChecks, type CheckDef } from "../lib/check-pattern.js";
import { wrapHandler, type ToolDef } from "./index.js";

const CHECKS: CheckDef[] = [
  {
    name: "description_empty",
    description: "Products where description is null or empty",
    countSql:
      "SELECT COUNT(*) AS cnt FROM products WHERE description_html IS NULL OR TRIM(description_html) = ''",
    sampleSql:
      "SELECT id, title, handle, status FROM products WHERE description_html IS NULL OR TRIM(description_html) = '' LIMIT ?",
  },
  {
    name: "title_copy",
    description: "Products where title contains 'Copy of' or 'Untitled'",
    countSql:
      "SELECT COUNT(*) AS cnt FROM products WHERE title LIKE '%Copy of%' OR title LIKE '%Untitled%'",
    sampleSql:
      "SELECT id, title, handle, status FROM products WHERE title LIKE '%Copy of%' OR title LIKE '%Untitled%' LIMIT ?",
  },
  {
    name: "no_tags",
    description: "Products with no entries in the product_tags table",
    countSql:
      "SELECT COUNT(*) AS cnt FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_tags pt WHERE pt.product_id = p.id)",
    sampleSql:
      "SELECT p.id, p.title, p.handle, p.status FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_tags pt WHERE pt.product_id = p.id) LIMIT ?",
  },
];

export const conditionsContent: ToolDef = {
  name: "slam_conditions_content",
  description:
    "Runs content quality checks: products with empty descriptions, 'Copy of'/'Untitled' titles, or missing tags.",
  schema: {},
  handler: wrapHandler(async () => {
    const { db } = getDb();
    const response = runChecks(db, "conditions", CHECKS);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  }),
};
