// T11.06 to T11.08 (US-17): what each importable module needs beyond its metadata. `defaults` are Zoho's export headings and the field each
// usually maps to (offered to the Admin, never applied silently); `fill` gives an unmapped required field a value Zoho has no column for.
export const IMPORT_MODULE_NAMES = ["Leads", "Accounts", "Contacts", "Deals", "Products"] as const;
export type ImportModuleName = (typeof IMPORT_MODULE_NAMES)[number];

type Def = { key: "leads" | "accounts" | "contacts" | "deals" | "products"; defaults: Record<string, string>; fill?: Record<string, string> };

const owner = (what: string) => ({ [`${what} Owner`]: "Owner" });
/** "Billing Street" → Billing_Street and so on; `last` is the postcode part (Code or Zip, as the module names it). */
const address = (prefix: string, last: "Code" | "Zip") =>
  Object.fromEntries([...["Street", "City", "State", "Country"], last].map((part) => [`${prefix} ${part}`, `${prefix}_${part}`]));

export const IMPORT_MODULES: Record<ImportModuleName, Def> = {
  Accounts: {
    key: "accounts",
    defaults: {
      "Record Id": "zoho_id", ...owner("Account"), "Account Name": "Account_Name", "Parent Account": "Parent_Account", "Account Number": "Account_Number", "Account Site": "Account_Site",
      "Account Type": "Account_Type", Ownership: "Ownership", Industry: "Industry", Rating: "Rating", Phone: "Phone", Fax: "Fax", Website: "Website", Employees: "Employees",
      "Annual Revenue": "Annual_Revenue", Description: "Description", ...address("Billing", "Code"), ...address("Shipping", "Code"),
    },
  },
  Products: {
    key: "products",
    defaults: { "Record Id": "zoho_id", ...owner("Product"), "Product Name": "Product_Name", "Product Code": "Product_Code", "Product Active": "Product_Active", "Product Category": "Product_Category", "Unit Price": "Unit_Price", "Usage Unit": "Usage_Unit", Description: "Description" },
    fill: { VAT_Category: "standard" }, // Zoho has no VAT category; Oman's standard rate is the safe reading, correctable per product afterwards
  },
  Contacts: {
    key: "contacts",
    defaults: {
      "Record Id": "zoho_id", ...owner("Contact"), Salutation: "Salutation", "First Name": "First_Name", "Last Name": "Last_Name", "Account Name": "Account_Name", Title: "Title", Department: "Department",
      Email: "Email", "Secondary Email": "Secondary_Email", Phone: "Phone", Mobile: "Mobile", "Home Phone": "Home_Phone", "Other Phone": "Other_Phone", Fax: "Fax", "Lead Source": "Lead_Source",
      "Date of Birth": "Date_of_Birth", Description: "Description", ...address("Mailing", "Zip"), ...address("Other", "Zip"),
    },
  },
  Leads: {
    key: "leads",
    defaults: {
      "Record Id": "zoho_id", ...owner("Lead"), Salutation: "Salutation", "First Name": "First_Name", "Last Name": "Last_Name", Company: "Company", Designation: "Designation", Email: "Email",
      "Secondary Email": "Secondary_Email", Phone: "Phone", Mobile: "Mobile", Fax: "Fax", Website: "Website", "Lead Source": "Lead_Source", "Lead Status": "Lead_Status", Industry: "Industry",
      Rating: "Rating", "Annual Revenue": "Annual_Revenue", "No of Employees": "No_of_Employees", Street: "Street", City: "City", State: "State", "Zip Code": "Zip_Code", Country: "Country", Description: "Description",
    },
  },
  Deals: {
    key: "deals",
    defaults: {
      "Record Id": "zoho_id", ...owner("Deal"), "Deal Name": "Deal_Name", "Account Name": "Account_Name", "Contact Name": "Contact_Name", Type: "Type", "Lead Source": "Lead_Source", Amount: "Amount",
      "Closing Date": "Closing_Date", Stage: "Stage", Probability: "Probability", "Next Step": "Next_Step", Description: "Description",
    },
  },
};

/** Zoho's stage names that differ from the seeded pipeline's (reference §2.7). Anything else must match a stage by name or the row is an error. */
export const STAGE_ALIASES: Record<string, string> = { "id. decision makers": "Identify Decision Makers", "closed-won": "Closed Won", "closed-lost": "Closed Lost", "closed lost to competitor": "Closed Lost to Competition" };
