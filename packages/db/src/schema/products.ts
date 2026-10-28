import { sql } from "drizzle-orm";
import { boolean, check, index, numeric, pgTable, text, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { REC, recFks, ZOHO, zohoIdx } from "./_columns.ts";
import { vatCategory } from "./settings.ts";

// SCHEMA § products (REC, ZOHO), public in org: everyone reads, only an Admin writes (RLS and the service). Prices are in OMR.
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey(),
    ...REC(),
    ...ZOHO(),
    productName: varchar("product_name", { length: 120 }).notNull(),
    productCode: varchar("product_code", { length: 40 }),
    isActive: boolean("is_active").notNull().default(true),
    category: varchar("category", { length: 60 }),
    vatCategory: vatCategory("vat_category").notNull(),
    unitPrice: numeric("unit_price", { precision: 18, scale: 3 }).notNull(),
    usageUnit: varchar("usage_unit", { length: 30 }),
    description: text("description"),
  },
  (t) => [
    unique("products_org_id_id_key").on(t.orgId, t.id),
    check("products_price_nonneg", sql`${t.unitPrice} >= 0`),
    check("products_description_length", sql`char_length(${t.description}) <= 32000`),
    uniqueIndex("products_product_code_key").on(t.orgId, sql`lower(${t.productCode})`).where(sql`${t.deletedAt} IS NULL`),
    index("products_name_trgm_idx").using("gin", t.productName.op("gin_trgm_ops")),
    index("products_list_idx").on(t.orgId, t.updatedAt.desc()).where(sql`${t.deletedAt} IS NULL`),
    zohoIdx("products", t),
    ...recFks("products", t),
  ],
);
