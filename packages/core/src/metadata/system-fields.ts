import type { schema } from "@crm/db";

// The system fields every org starts with (ADR-0006), grouped as the default layout's sections. provisionOrg seeds
// them as `fields` rows (is_system, column_name) plus one default layout; label keys are fields.<Module>.<api_name>.

type FieldType = (typeof schema.fieldType.enumValues)[number];
type Spec = { api: string; type: FieldType; col: string; req?: true; max?: number; lookup?: string };
type Section = { label: string; columns?: 1; fields: Spec[] };

const text = (api: string, col: string, max: number, req?: true): Spec => ({ api, type: "text", col, max, req });
const pick = (api: string, col: string): Spec => ({ api, type: "picklist", col }); // picklist api_name = field api_name
const address = (prefix: string, code: string): Spec[] => [
  text(`${prefix}_Street`, `${prefix.toLowerCase()}_street`, 250),
  text(`${prefix}_City`, `${prefix.toLowerCase()}_city`, 30),
  text(`${prefix}_State`, `${prefix.toLowerCase()}_state`, 30),
  text(`${prefix}_${code}`, `${prefix.toLowerCase()}_${code.toLowerCase()}`, 30),
  text(`${prefix}_Country`, `${prefix.toLowerCase()}_country`, 2),
];
const owner: Spec = { api: "Owner", type: "user_lookup", col: "owner_id" };
const description: Section = { label: "description_information", columns: 1, fields: [{ api: "Description", type: "textarea", col: "description", max: 32000 }] };

/** Picklist api_name → stored values, in display order (reference §2.4; admins may edit them later). */
export const SYSTEM_PICKLISTS: Record<string, string[]> = {
  Account_Type: ["Analyst", "Competitor", "Customer", "Distributor", "Integrator", "Investor", "Partner", "Press", "Prospect", "Reseller", "Other"],
  Ownership: ["Public", "Private", "Subsidiary", "Partnership", "Government", "Privately Held", "Public Company", "Other"],
  Industry: ["Communications", "Construction", "Consulting", "Education", "Financial Services", "Government", "Healthcare", "Hospitality",
    "Manufacturing", "Oil and Gas", "Real Estate", "Retail", "Technology", "Transportation", "Other"],
  Rating: ["Acquired", "Active", "Market Failed", "Project Cancelled", "Shut Down"],
};

export const SYSTEM_FIELDS: Record<string, Section[]> = {
  Accounts: [
    {
      label: "account_information",
      fields: [
        owner,
        text("Account_Name", "account_name", 100, true),
        { api: "Parent_Account", type: "lookup", col: "parent_account_id", lookup: "Accounts" },
        text("Account_Number", "account_number", 40),
        text("Account_Site", "account_site", 80),
        text("Ticker_Symbol", "ticker_symbol", 20),
        pick("Account_Type", "account_type"),
        pick("Ownership", "ownership"),
        pick("Industry", "industry"),
        pick("Rating", "rating"),
        { api: "Phone", type: "phone", col: "phone", max: 30 },
        { api: "Fax", type: "phone", col: "fax", max: 30 },
        { api: "Email", type: "email", col: "email" },
        { api: "Website", type: "url", col: "website", max: 120 },
        { api: "Employees", type: "integer", col: "employees" },
        { api: "SIC_Code", type: "integer", col: "sic_code" },
        { api: "Annual_Revenue", type: "currency", col: "annual_revenue" },
        text("VAT_Number", "vat_number", 20),
      ],
    },
    { label: "address_information", fields: [...address("Billing", "Code"), ...address("Shipping", "Code")] },
    description,
  ],
};
