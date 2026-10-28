import type { schema } from "@crm/db";

// The system fields every org starts with (ADR-0006), grouped as the default layout's sections. provisionOrg seeds
// them as `fields` rows (is_system, column_name) plus one default layout; label keys are fields.<Module>.<api_name>.

type FieldType = (typeof schema.fieldType.enumValues)[number];
type Spec = { api: string; type: FieldType; col: string; req?: true; ro?: true; max?: number; lookup?: string; list?: string };
type Section = { label: string; columns?: 1; fields: Spec[] };

const text = (api: string, col: string, max: number, req?: true): Spec => ({ api, type: "text", col, max, req });
const pick = (api: string, col: string, list = api): Spec => ({ api, type: "picklist", col, list }); // picklist api_name = field api_name unless modules share a name
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
  Salutation: ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."],
  Task_Status: ["Not Started", "Deferred", "In Progress", "Completed", "Waiting for input"],
  Task_Priority: ["Highest", "High", "Normal", "Low", "Lowest"],
  Call_Status: ["Planned", "Held", "Cancelled"],
  Meeting_Status: ["Planned", "Held", "Cancelled"],
  Call_Type: ["Inbound", "Outbound", "Missed"],
  Deal_Type: ["New Business", "Existing Business"],
  Currency: ["OMR", "AED", "INR"], // active currencies; each needs an exchange rate to be used (T6.04)
  Reason_For_Loss: ["Price", "Competitor", "No Budget", "No Decision", "Other"],
  Forecast_Category: ["pipeline", "best_case", "committed", "closed", "omitted"], // the forecast_category enum, in order
  Lead_Status: ["Not Contacted", "Attempted to Contact", "Contact in Future", "Contacted", "Pre-Qualified", "Not Qualified", "Junk Lead", "Lost Lead"],
  Lead_Source: ["Advertisement", "Cold Call", "Employee Referral", "External Referral", "Online Store", "Partner", "Public Relations",
    "Sales Email Alias", "Seminar Partner", "Internal Seminar", "Trade Show", "Web Download", "Web Research", "Chat"],
};

const subject: Spec = { api: "Subject", type: "text", col: "subject", max: 255, req: true };
/** Who_Id is a Lead or Contact, What_Id an Account, Deal, Quote, Sales Order or Invoice (polymorphic: the _type column sits beside it). */
const links: Spec[] = [{ api: "Who_Id", type: "polymorphic", col: "who_id" }, { api: "What_Id", type: "polymorphic", col: "what_id" }];
const when = (api: string, col: string, req?: true): Spec => ({ api, type: "datetime", col, req });

export const SYSTEM_FIELDS: Record<string, Section[]> = {
  Leads: [
    {
      label: "lead_information",
      fields: [
        owner,
        pick("Salutation", "salutation"),
        text("First_Name", "first_name", 40),
        text("Last_Name", "last_name", 80, true),
        text("Company", "company", 100, true),
        text("Designation", "designation", 100),
        { api: "Email", type: "email", col: "email", max: 100 },
        { api: "Secondary_Email", type: "email", col: "secondary_email", max: 100 },
        { api: "Phone", type: "phone", col: "phone", max: 30 },
        { api: "Mobile", type: "phone", col: "mobile", max: 30 }, // stored as E.164 (US-06)
        { api: "Fax", type: "phone", col: "fax", max: 30 },
        { api: "Website", type: "url", col: "website", max: 120 },
        pick("Lead_Source", "lead_source"),
        pick("Lead_Status", "lead_status"),
        pick("Industry", "industry"),
        pick("Rating", "rating"),
        { api: "Annual_Revenue", type: "currency", col: "annual_revenue" },
        { api: "No_of_Employees", type: "integer", col: "no_of_employees" },
        { api: "Email_Opt_Out", type: "boolean", col: "email_opt_out" },
      ],
    },
    { label: "address_information", fields: [text("Street", "street", 250), text("City", "city", 30), text("State", "state", 30), text("Zip_Code", "zip_code", 30), text("Country", "country", 2)] },
    description,
  ],
  Deals: [
    {
      label: "deal_information",
      fields: [
        owner,
        text("Deal_Name", "deal_name", 120, true),
        { api: "Account_Name", type: "lookup", col: "account_id", lookup: "Accounts", req: true },
        { api: "Contact_Name", type: "lookup", col: "contact_id", lookup: "Contacts" },
        text("Contact_Role", "contact_role", 60),
        pick("Type", "type", "Deal_Type"),
        pick("Lead_Source", "lead_source"),
        { api: "Amount", type: "currency", col: "amount" },
        pick("Currency", "currency"),
        { api: "Exchange_Rate", type: "decimal", col: "exchange_rate", ro: true },
        { api: "Closing_Date", type: "date", col: "closing_date", req: true },
        // Pipeline and Stage are lookups into the pipeline set-up (registry SETUP_LOOKUPS); the pipeline follows the stage.
        { api: "Pipeline", type: "lookup", col: "pipeline_id", ro: true },
        { api: "Stage", type: "lookup", col: "stage_id", req: true },
        { api: "Probability", type: "integer", col: "probability" },
        { api: "Expected_Revenue", type: "currency", col: "expected_revenue", ro: true },
        pick("Forecast_Category", "forecast_category"),
        text("Next_Step", "next_step", 100),
        pick("Reason_For_Loss", "reason_for_loss"),
      ],
    },
    description,
  ],
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
  Contacts: [
    {
      label: "contact_information",
      fields: [
        owner,
        pick("Salutation", "salutation"),
        text("First_Name", "first_name", 40),
        text("Last_Name", "last_name", 80, true),
        { api: "Account_Name", type: "lookup", col: "account_id", lookup: "Accounts" },
        text("Title", "title", 100),
        text("Department", "department", 100),
        { api: "Email", type: "email", col: "email", max: 100 },
        { api: "Secondary_Email", type: "email", col: "secondary_email", max: 100 },
        { api: "Phone", type: "phone", col: "phone", max: 30 },
        { api: "Mobile", type: "phone", col: "mobile", max: 30 }, // stored as E.164 (US-06)
        { api: "Home_Phone", type: "phone", col: "home_phone", max: 30 },
        { api: "Other_Phone", type: "phone", col: "other_phone", max: 30 },
        { api: "Fax", type: "phone", col: "fax", max: 30 },
        text("Assistant", "assistant", 80),
        { api: "Asst_Phone", type: "phone", col: "asst_phone", max: 30 },
        { api: "Date_of_Birth", type: "date", col: "date_of_birth" },
        { api: "Reporting_To", type: "lookup", col: "reporting_to_id", lookup: "Contacts" },
        pick("Lead_Source", "lead_source"),
        { api: "Email_Opt_Out", type: "boolean", col: "email_opt_out" },
      ],
    },
    { label: "address_information", fields: [...address("Mailing", "Zip"), ...address("Other", "Zip")] },
    description,
  ],
  Tasks: [
    {
      label: "task_information",
      fields: [
        owner,
        subject,
        { api: "Due_Date", type: "date", col: "due_date" },
        pick("Status", "status", "Task_Status"),
        pick("Priority", "priority", "Task_Priority"),
        ...links,
      ],
    },
    description,
  ],
  Calls: [
    {
      label: "call_information",
      fields: [
        owner,
        subject,
        { ...pick("Call_Type", "call_type"), req: true },
        text("Call_Purpose", "call_purpose", 120),
        when("Call_Start_Time", "call_start_at", true),
        { api: "Call_Duration_Seconds", type: "integer", col: "call_duration_seconds", req: true },
        text("Call_Result", "call_result", 120),
        pick("Status", "status", "Call_Status"),
        ...links,
      ],
    },
    description,
  ],
  Meetings: [
    {
      label: "meeting_information",
      fields: [
        owner,
        subject,
        when("Start_DateTime", "start_at", true),
        when("End_DateTime", "end_at", true),
        { api: "All_day", type: "boolean", col: "all_day" },
        text("Venue", "venue", 255),
        pick("Status", "status", "Meeting_Status"),
        ...links,
      ],
    },
    description,
  ],
};
