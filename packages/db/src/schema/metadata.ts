import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { AUDIT, auditFks } from "./_columns.ts";

// SCHEMA § Metadata (ADR-0006): modules, fields, picklists and layouts are org-scoped data, not DDL.
// The api_name immutability triggers, grants and RLS (tenant_isolation + admin_only writes) are hand-written SQL.

export const fieldType = pgEnum("field_type", [
  "text",
  "textarea",
  "email",
  "phone",
  "url",
  "picklist",
  "multiselect",
  "date",
  "datetime",
  "integer",
  "decimal",
  "currency",
  "percent",
  "boolean",
  "lookup",
  "user_lookup",
  "polymorphic",
  "autonumber",
]);

export const modules = pgTable(
  "modules",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    apiName: varchar("api_name", { length: 60 }).notNull(), // immutable (trigger)
    labelKey: varchar("label_key", { length: 120 }).notNull(), // i18n key
    isCustom: boolean("is_custom").notNull().default(false), // always false in the MVP
    sortOrder: smallint("sort_order").notNull(),
  },
  (t) => [unique("modules_org_id_id_key").on(t.orgId, t.id), unique("modules_org_id_api_name_key").on(t.orgId, t.apiName), ...auditFks("modules", t)],
);

export const picklists = pgTable(
  "picklists",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    apiName: varchar("api_name", { length: 60 }).notNull(),
  },
  (t) => [unique("picklists_org_id_id_key").on(t.orgId, t.id), unique("picklists_org_id_api_name_key").on(t.orgId, t.apiName), ...auditFks("picklists", t)],
);

export const picklistValues = pgTable(
  "picklist_values",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    picklistId: uuid("picklist_id").notNull(),
    value: varchar("value", { length: 120 }).notNull(), // stored value, stable: deactivate, never delete
    labelKey: varchar("label_key", { length: 120 }).notNull(),
    category: text("category"),
    sortOrder: smallint("sort_order").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    unique("picklist_values_org_id_picklist_id_value_key").on(t.orgId, t.picklistId, t.value),
    foreignKey({ name: "picklist_values_picklist_fk", columns: [t.orgId, t.picklistId], foreignColumns: [picklists.orgId, picklists.id] }).onDelete("cascade"),
    check("picklist_values_category_check", sql`${t.category} IN ('open', 'won', 'lost')`),
    ...auditFks("picklist_values", t),
  ],
);

export const fields = pgTable(
  "fields",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    moduleId: uuid("module_id").notNull(),
    apiName: varchar("api_name", { length: 60 }).notNull(), // immutable (trigger fields_api_name_immutable)
    labelKey: varchar("label_key", { length: 120 }).notNull(),
    dataType: fieldType("data_type").notNull(),
    isSystem: boolean("is_system").notNull(),
    columnName: varchar("column_name", { length: 63 }), // system fields only; custom values live in custom->>api_name
    required: boolean("required").notNull().default(false),
    isUnique: boolean("is_unique").notNull().default(false),
    readOnly: boolean("read_only").notNull().default(false),
    maxLength: integer("max_length"),
    precision: smallint("precision"),
    scale: smallint("scale"),
    defaultValue: jsonb("default_value"),
    picklistId: uuid("picklist_id"),
    lookupModuleId: uuid("lookup_module_id"),
  },
  (t) => [
    unique("fields_org_id_id_key").on(t.orgId, t.id),
    unique("fields_org_id_module_id_api_name_key").on(t.orgId, t.moduleId, t.apiName),
    foreignKey({ name: "fields_module_fk", columns: [t.orgId, t.moduleId], foreignColumns: [modules.orgId, modules.id] }).onDelete("cascade"),
    foreignKey({ name: "fields_picklist_fk", columns: [t.orgId, t.picklistId], foreignColumns: [picklists.orgId, picklists.id] }).onDelete("restrict"),
    foreignKey({ name: "fields_lookup_module_fk", columns: [t.orgId, t.lookupModuleId], foreignColumns: [modules.orgId, modules.id] }).onDelete("restrict"),
    check("fields_system_column", sql`${t.isSystem} = (${t.columnName} IS NOT NULL)`),
    // A real column's name, never an expression: services still map it against their own column list.
    check("fields_column_name_identifier", sql`${t.columnName} ~ '^[a-z_][a-z0-9_]{0,62}$'`),
    check("fields_picklist", sql`(${t.dataType} IN ('picklist', 'multiselect')) = (${t.picklistId} IS NOT NULL)`),
    ...auditFks("fields", t),
  ],
);

export const layouts = pgTable(
  "layouts",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    moduleId: uuid("module_id").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [
    unique("layouts_org_id_id_key").on(t.orgId, t.id),
    uniqueIndex("layouts_one_default").on(t.orgId, t.moduleId).where(sql`${t.isDefault}`),
    foreignKey({ name: "layouts_module_fk", columns: [t.orgId, t.moduleId], foreignColumns: [modules.orgId, modules.id] }).onDelete("cascade"),
    ...auditFks("layouts", t),
  ],
);

export const layoutSections = pgTable(
  "layout_sections",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    layoutId: uuid("layout_id").notNull(),
    labelKey: varchar("label_key", { length: 120 }).notNull(),
    sortOrder: smallint("sort_order").notNull(),
    columns: smallint("columns").notNull().default(2),
  },
  (t) => [
    unique("layout_sections_org_id_id_key").on(t.orgId, t.id),
    foreignKey({ name: "layout_sections_layout_fk", columns: [t.orgId, t.layoutId], foreignColumns: [layouts.orgId, layouts.id] }).onDelete("cascade"),
    check("layout_sections_columns_check", sql`${t.columns} IN (1, 2)`),
    ...auditFks("layout_sections", t),
  ],
);

export const layoutFields = pgTable(
  "layout_fields",
  {
    id: uuid("id").primaryKey(),
    ...AUDIT(),
    sectionId: uuid("section_id").notNull(),
    fieldId: uuid("field_id").notNull(),
    sortOrder: smallint("sort_order").notNull(),
  },
  (t) => [
    unique("layout_fields_org_id_section_id_field_id_key").on(t.orgId, t.sectionId, t.fieldId),
    foreignKey({ name: "layout_fields_section_fk", columns: [t.orgId, t.sectionId], foreignColumns: [layoutSections.orgId, layoutSections.id] }).onDelete("cascade"),
    foreignKey({ name: "layout_fields_field_fk", columns: [t.orgId, t.fieldId], foreignColumns: [fields.orgId, fields.id] }).onDelete("cascade"),
    ...auditFks("layout_fields", t),
  ],
);

/** A missing row means read_write. */
export const fieldPermissions = pgTable(
  "field_permissions",
  {
    ...AUDIT(),
    fieldId: uuid("field_id").notNull(),
    role: text("role").notNull(),
    access: text("access").notNull(),
  },
  (t) => [
    primaryKey({ name: "field_permissions_pkey", columns: [t.orgId, t.fieldId, t.role] }),
    foreignKey({ name: "field_permissions_field_fk", columns: [t.orgId, t.fieldId], foreignColumns: [fields.orgId, fields.id] }).onDelete("cascade"),
    check("field_permissions_role_check", sql`${t.role} IN ('admin', 'manager', 'rep')`),
    check("field_permissions_access_check", sql`${t.access} IN ('read_write', 'read_only', 'hidden')`),
    ...auditFks("field_permissions", t),
  ],
);
