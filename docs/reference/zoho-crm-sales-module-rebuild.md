**Zoho CRM Sales Module — Rebuild Specification and Build Prompt**

Target named by user:
https://crm.zoho.in/crm/org60093287285/tab/Home/begin (Zoho CRM, India
data centre, org 60093287285)  
Prepared: 25 October 2026

**0. Provenance and limits (read first)**

|                             |                                                                                                                                                                                                                                        |
|-----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Item                        | Status                                                                                                                                                                                                                                 |
| Provenance label            | **Documentation-based.** Built from Zoho's public help centre and developer API docs, not from your live org.                                                                                                                          |
| Live org inspected?         | **No.** The org URL needs your Zoho login. No local browser session was available, and the Zoho CRM connector was not authorised, so no fields, layouts, custom modules, picklists, blueprints or data from org 60093287285 were read. |
| Binary / JS bundle analysis | Not performed. Recovering Zoho's proprietary front-end code is outside scope. This is a clean-room functional spec.                                                                                                                    |
| What this means             | The doc describes **standard Zoho CRM Sales behaviour**. Any customisations in your org (renamed modules, custom fields, extra pipelines, blueprints, Deluge functions) are **not** captured. See section 12 for how to fill that gap. |
| Values marked "(verify)"    | Typical out-of-box defaults that are commonly reported but not confirmed against an official Zoho table in this pass.                                                                                                                  |

Do not copy Zoho logos, icons, CSS or wording into a product you ship.
Rebuild the behaviour, not the brand.

**1. Scope: what "the Sales module" contains**

Zoho groups its CRM modules into functional areas. The Sales area covers
the following standard modules ([<u>Zoho standard modules &
fields</u>](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/standard-modules-fields),
[<u>Understand your CRM
account</u>](https://help.zoho.com/portal/en/kb/crm/crm-reference/introduction-to-zoho-crm/articles/understand-crm-account)):

|                 |                                                                                 |                                                                                     |
|-----------------|---------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| Group           | Modules                                                                         | Must-have in rebuild                                                                |
| Sales core      | Leads, Contacts, Accounts, Deals                                                | Yes                                                                                 |
| Activities      | Tasks, Meetings (Events), Calls                                                 | Yes                                                                                 |
| Planning        | Forecasts, Campaigns                                                            | Yes (Forecasts), Optional (Campaigns)                                               |
| Inventory / CPQ | Products, Price Books, Quotes, Sales Orders, Invoices, Vendors, Purchase Orders | Products, Price Books, Quotes, Sales Orders, Invoices = Yes; Vendors, POs = Phase 2 |
| Cross-cutting   | Home dashboard, Reports, Dashboards, Notes, Attachments, Tags, Timeline         | Yes                                                                                 |

Lifecycle in one line: **Lead → (Convert) → Contact + Account + optional
Deal → Deal moves through pipeline stages → Quote → Sales Order →
Invoice.** Zoho describes leads as unqualified prospects that become a
Contact, Account and Deal on conversion, then progress in Deals until
won or lost ([<u>Working with
Leads</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/leads/articles/leads-26-4-2026)).
Inventory modules handle quoting, ordering and invoicing once a deal is
progressing ([<u>Inventory
Management</u>](https://help.zoho.com/portal/en/kb/crm/manage-inventory/overview/articles/inventory)).

**2. Data model**

**2.1 Entity relationship overview**

User ─┬─\< Lead  
├─\< Account ─┬─\< Contact  
│ ├─\< Deal ─┬─\< Quote ─┬─\< SalesOrder ─\< Invoice  
│ │ │ │  
│ │ └─ Contact (primary, with Contact Role)  
│ └─ Parent Account (self-ref)  
├─\< Task / Meeting / Call (polymorphic: Who = Lead\|Contact, What =
Account\|Deal\|Quote\|...)  
└─\< Forecast (per user / per period)  
  
Product \>─ Vendor  
PriceBook \>─\< Product (with list price per product)  
Quote/SO/Invoice ─\< LineItem \>─ Product  
Campaign \>─\< Lead / Contact ; Deal.campaign_source → Campaign

**2.2 Common system fields (every module)**

id (64-bit / UUID), owner_id (User), created_by, created_time,
modified_by, modified_time, tags\[\], layout_id, is_deleted /
recycle-bin timestamp, currency + exchange_rate (if multi-currency),
record_status / approval lock flag.

Every module, field and related list in Zoho has a stable api_name used
in integrations ([<u>Modules API
v8</u>](https://www.zoho.com/crm/developer/docs/api/v8/modules-api.html)).
Reproduce this: give each field a display label **and** an immutable API
name.

**2.3 Leads**

Field list per [<u>Zoho standard
fields</u>](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/standard-modules-fields).

|                                                                             |                         |              |        |     |
|-----------------------------------------------------------------------------|-------------------------|--------------|--------|-----|
| Field                                                                       | API name (suggested)    | Type         | Limit  | Req |
| Lead Owner                                                                  | Owner                   | Lookup(User) | —      |     |
| Salutation                                                                  | Salutation              | Picklist     | —      |     |
| First Name                                                                  | First_Name              | Text         | 40     |     |
| Last Name                                                                   | Last_Name               | Text         | 80     | ✔   |
| Title                                                                       | Designation             | Text         | 100    |     |
| Company                                                                     | Company                 | Text         | 100    | ✔   |
| Lead Source                                                                 | Lead_Source             | Picklist     | —      |     |
| Industry                                                                    | Industry                | Picklist     | —      |     |
| Annual Revenue                                                              | Annual_Revenue          | Currency     | 16     |     |
| Phone / Mobile / Fax                                                        | Phone / Mobile / Fax    | Phone text   | 30     |     |
| Email / Secondary Email                                                     | Email / Secondary_Email | Email        | 100    |     |
| Skype ID                                                                    | Skype_ID                | Text (6–32)  | 50     |     |
| Website                                                                     | Website                 | URL          | 120    |     |
| Lead Status                                                                 | Lead_Status             | Picklist     | —      |     |
| Rating                                                                      | Rating                  | Picklist     | —      |     |
| No. of Employees                                                            | No_of_Employees         | Integer      | —      |     |
| Email Opt-out                                                               | Email_Opt_Out           | Boolean      | —      |     |
| Street, City, State, Zip Code, Country                                      | Street … Country        | Text         | 250/30 |     |
| Description                                                                 | Description             | Long text    | 32,000 |     |
| (system) Converted flag, Converted date, Converted Contact/Account/Deal ids | Converted\_\_s etc.     | System       | —      |     |

Default picklists (verify):

- Lead Status: Not Contacted, Attempted to Contact, Contact in Future,
  Contacted, Pre-Qualified, Not Qualified, Junk Lead, Lost Lead.

- Lead Source: Advertisement, Cold Call, Employee Referral, External
  Referral, Online Store, Partner, Public Relations, Sales Email Alias,
  Seminar Partner, Internal Seminar, Trade Show, Web Download, Web
  Research, Chat.

- Rating: Acquired, Active, Market Failed, Project Cancelled, Shut Down.

Zoho also lets picklist values be mapped to record categories (Open /
Success / Failed) so a status strip and automations can read the overall
state ([<u>picklist record
category</u>](https://help.zoho.com/portal/en/kb/crm-nextgen/customize-crm-account/customizing-fields/articles/nextgen-record-category-classify-and-track-record-status-with-picklist-mapping)).
Model picklist_value.category.

**2.4 Accounts**

|                                                      |                                                                                                                                 |     |
|------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|-----|
| Field                                                | Type                                                                                                                            | Req |
| Account Name                                         | Text(100)                                                                                                                       | ✔   |
| Account Owner                                        | Lookup(User)                                                                                                                    |     |
| Website                                              | URL                                                                                                                             |     |
| Ticker Symbol                                        | Text                                                                                                                            |     |
| Parent Account                                       | Lookup(Account, self)                                                                                                           |     |
| Employees                                            | Integer                                                                                                                         |     |
| Ownership                                            | Picklist (Public, Private, Subsidiary, Partnership, Government, Privately Held, Public Company, Other — verify)                 |     |
| Industry                                             | Picklist                                                                                                                        |     |
| Account Type                                         | Picklist (Analyst, Competitor, Customer, Distributor, Integrator, Investor, Partner, Press, Prospect, Reseller, Other — verify) |     |
| Account Number                                       | Number                                                                                                                          |     |
| Account Site                                         | Text                                                                                                                            |     |
| Phone, Fax, Email                                    | Text/Email                                                                                                                      |     |
| Rating                                               | Picklist                                                                                                                        |     |
| SIC Code                                             | Integer                                                                                                                         |     |
| Annual Revenue                                       | Currency                                                                                                                        |     |
| Billing Address (Street, City, State, Code, Country) | Address group                                                                                                                   |     |
| Shipping Address (same)                              | Address group                                                                                                                   |     |
| Description                                          | Long text                                                                                                                       |     |

UI action: "Copy Billing → Shipping".

**2.5 Contacts**

|                                             |                       |     |
|---------------------------------------------|-----------------------|-----|
| Field                                       | Type                  | Req |
| Contact Owner                               | Lookup(User)          |     |
| Salutation, First Name                      | Picklist, Text(40)    |     |
| Last Name                                   | Text                  | ✔   |
| Account Name                                | Lookup(Account)       |     |
| Vendor Name                                 | Lookup(Vendor)        |     |
| Lead Source                                 | Picklist              |     |
| Title, Department                           | Text                  |     |
| Date of Birth                               | Date                  |     |
| Reporting To                                | Lookup(Contact, self) |     |
| Email, Secondary Email                      | Email                 |     |
| Phone, Mobile, Home Phone, Other Phone, Fax | Phone                 |     |
| Assistant, Asst Phone                       | Text                  |     |
| Skype ID                                    | Text                  |     |
| Email Opt Out                               | Boolean               |     |
| Mailing Address, Other Address              | Address groups        |     |
| Description                                 | Long text             |     |

Source: [<u>Zoho standard
fields</u>](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/standard-modules-fields).

**2.6 Deals**

Field list per [<u>Standard Fields in
Deals</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/deal-management/articles/standard-fields-deals).

|                        |                      |                                           |     |                                                                               |
|------------------------|----------------------|-------------------------------------------|-----|-------------------------------------------------------------------------------|
| Field                  | API name             | Type                                      | Req | Notes                                                                         |
| Deal Owner             | Owner                | Lookup(User)                              |     |                                                                               |
| Deal Name              | Deal_Name            | Text(120)                                 | ✔   |                                                                               |
| Account Name           | Account_Name         | Lookup(Account)                           | ✔   |                                                                               |
| Contact Name           | Contact_Name         | Lookup(Contact)                           |     |                                                                               |
| Type                   | Type                 | Picklist: New Business, Existing Business |     |                                                                               |
| Lead Source            | Lead_Source          | Picklist                                  |     |                                                                               |
| Campaign Source        | Campaign_Source      | Lookup(Campaign)                          |     |                                                                               |
| Amount                 | Amount               | Currency                                  |     |                                                                               |
| Closing Date           | Closing_Date         | Date                                      | ✔   |                                                                               |
| Pipeline               | Pipeline             | Picklist (layout-bound)                   | ✔   | Required in convert API                                                       |
| Stage                  | Stage                | Picklist                                  | ✔   | Drives probability                                                            |
| Probability (%)        | Probability          | Integer 0–100                             |     | Auto from stage, editable                                                     |
| Expected Revenue       | Expected_Revenue     | Currency (computed)                       |     | Amount × Probability / 100                                                    |
| Forecast Category      | Forecast_Category    | Picklist (computed default)               |     | Pipeline / Best Case / Committed / Closed / Omitted                           |
| Next Step              | Next_Step            | Text(100)                                 |     |                                                                               |
| Reason for Loss        | Reason_For_Loss\_\_s | Picklist                                  |     | Prompt when moved to a Closed Lost stage                                      |
| Description            | Description          | Long text                                 |     |                                                                               |
| (system) Stage History | related table        |                                           |     | Stage, amount, probability, closing date, modified by/time, duration in stage |

The convert-lead API names Deal_Name, Closing_Date, Pipeline and Stage
as mandatory when creating a deal ([<u>Convert Lead API
v8</u>](https://www.zoho.com/crm/developer/docs/api/v8/convert-lead.html)).

**2.7 Stage–probability mapping (configuration table)**

Admins define each stage with a **probability**, a **record category**
(Open, Closed Won, Closed Lost) and a **forecast category** ([<u>Modify
special
fields</u>](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/modify-special-fields)).
The five system forecast categories are Pipeline, Best Case, Committed,
Closed and Omitted ([<u>Forecast
configuration</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/forecasts/articles/setting-up-forecast-configuration-and-creating-forecasts)).
The mapping is per layout and per pipeline.

Seed data. Stage names come from [<u>Zoho One deal
management</u>](https://www.zoho.com/one/guides/dealmanagement.html).
Some probabilities are reported by
[<u>CodeStringers</u>](https://www.codestringers.com/videos/zoho-crm-stage-probability-forecast);
the others are marked (verify).

|     |                                     |             |                 |                   |
|-----|-------------------------------------|-------------|-----------------|-------------------|
| \#  | Stage                               | Prob %      | Record category | Forecast category |
| 1   | Qualification                       | 10          | Open            | Pipeline          |
| 2   | Needs Analysis                      | 20          | Open            | Pipeline          |
| 3   | Value Proposition                   | 40          | Open            | Pipeline          |
| 4   | Identify Decision Makers            | 60          | Open            | Pipeline          |
| 5   | Perception Analysis (verify)        | 70 (verify) | Open            | Best Case         |
| 6   | Proposal/Price Quote                | 75          | Open            | Best Case         |
| 7   | Negotiation/Review                  | 90 (verify) | Open            | Committed         |
| 8   | Closed Won                          | 100         | Closed Won      | Closed            |
| 9   | Closed Lost                         | 0           | Closed Lost     | Omitted           |
| 10  | Closed Lost to Competition (verify) | 0           | Closed Lost     | Omitted           |

Rules:

- Changing Stage sets Probability and Forecast Category to the mapped
  defaults.

- While a deal is Open, the user may override Forecast Category. Zoho
  allows editing the category for open stages ([<u>Creating and working
  with
  forecasts</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/forecasts/articles/creating-and-working-with-forecasts)).

- Deleting a stage requires reassigning existing deals to another stage.

- Support **multiple pipelines**, each with its own ordered subset of
  stages, bound to a Deals layout.

**2.8 Activities**

Source: [<u>Zoho standard
fields</u>](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/standard-modules-fields).

**Tasks:** Owner, Subject (required), Due Date, Who (Contact or Lead),
What (Account, Deal or other record), Status (Not Started, Deferred, In
Progress, Completed, Waiting for input — verify), Priority (High,
Highest, Low, Lowest, Normal — verify), Send Notification Email,
Reminder, Recurring rule (RRULE), Description.

**Meetings:** Owner, Subject (required), Start DateTime and End DateTime
(required), All-day, Venue, Who, What, Participants (users, contacts,
leads, with an invite-status flag), Reminder, Recurring rule,
Description.

**Calls:** Subject (required), Call Type (Inbound, Outbound or Missed;
required), Call Purpose, Call From/To (Contact or Lead), Related To,
Call Details (Current, Completed or Scheduled), Call Start Time
(required), Call Duration (required), Call Result, Description.

Polymorphic links: who_type, who_id, what_type and what_id. Activities
appear in "Open Activities" and "Closed Activities" related lists on
every parent record.

**2.9 Products and Price Books**

**Product:** Product Name (required), Product Code, Active, Vendor
(lookup), Manufacturer, Category, Sales Start/End Date, Support
Start/Expiry Date, Unit Price, Commission Rate, Taxable plus a tax list,
Usage Unit, Qty Ordered, Qty in Stock, Reorder Level, Qty in Demand,
Handler (User), Description.

**Price Book:** Name (required), Owner, Active, Pricing Model (None,
Flat or Differential), Pricing Details (rows of From Range, To Range and
Discount %), Description. It has an M:N link to Products, each with its
own **List Price**. Price books let you sell one product at different
prices to different customers ([<u>Inventory
Management</u>](https://help.zoho.com/portal/en/kb/crm/manage-inventory/overview/articles/inventory)).

**2.10 Quotes, Sales Orders, Invoices (and Purchase Orders)**

Shared header fields: Owner, Subject (required), Number (auto,
read-only), Deal (lookup), Contact, Account (required), Billing Address,
Shipping Address, Terms & Conditions, Description, Currency.

|                          |                                                                                                                              |                                                                            |
|--------------------------|------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| Module                   | Extra header fields                                                                                                          | Status picklist (verify)                                                   |
| Quote                    | Quote Stage, Valid Till, Carrier, Shipping, Inventory Manager                                                                | Draft, Negotiation, Delivered, On Hold, Confirmed, Closed Won, Closed Lost |
| Sales Order              | SO Number, Quote (lookup), Customer No, Purchase Order ref, Due Date, Carrier, Pending, Excise Duty, Sales Commission        | Created, Approved, Delivered, Cancelled                                    |
| Invoice                  | Invoice Number, Sales Order (lookup), Customer No, Purchase Order ref, Invoice Date, Due Date, Excise Duty, Sales Commission | Created, Approved, Delivered, Paid (verify), Cancelled                     |
| Purchase Order (Phase 2) | PO Number, Vendor (required), Requisition No, Tracking Number, PO Date, Due Date, Carrier                                    | Created, Approved, Delivered, Cancelled                                    |

Field lists come from [<u>Zoho standard
fields</u>](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/standard-modules-fields).

**Line item subform** (QuotedItems, OrderedItems, InvoicedItems,
PurchaseItems — these names appear as supported modules in the
[<u>Create Custom Field
API</u>](https://www.zoho.com/crm/developer/docs/api/v8/create-custom-field.html)):

|                      |                                                                                                                 |
|----------------------|-----------------------------------------------------------------------------------------------------------------|
| Column               | Rule                                                                                                            |
| Product              | Lookup (required)                                                                                               |
| Description          | Defaults from the product                                                                                       |
| Qty in Stock         | Read-only, from the product                                                                                     |
| Quantity             | Required, \> 0                                                                                                  |
| List Price           | Defaults to the product's Unit Price, or to the selected Price Book's list price (Price Book lookup on the row) |
| Amount               | Quantity × List Price                                                                                           |
| Discount             | % or flat amount                                                                                                |
| Total After Discount | Amount − Discount                                                                                               |
| Tax                  | Sum of the applicable tax rates × Total After Discount (only if the product is Taxable)                         |
| Total                | Total After Discount + Tax                                                                                      |

**Footer totals:**

Sub Total = Σ line.Total  
Discount = header-level % or amount  
Tax = header-level tax (if tax mode = "on total")  
Adjustment = signed amount  
Grand Total = Sub Total − Discount + Tax + Adjustment

Round to the currency's precision. Store the inputs and the computed
outputs. Recompute on the server, and never trust client totals.

**Conversions:**

- Quote → Sales Order or Invoice through a "Convert" action on the
  quote. Custom fields use admin-defined Quote Conversion Mapping
  ([<u>Creating
  Quotes</u>](https://help.zoho.com/portal/en/kb/crm/manage-inventory/quotes/articles/create-quotes)).

- Sales Order → Invoice uses the same pattern (SO Conversion Mapping).

- Line items, addresses, account, contact, deal and terms are copied
  over, and a back-reference is kept.

**2.11 Forecasts**

Fields: Year (required), Quarter (required), Month, Quota, Closed (sum
of closed-won deals), Pipeline (sum of open deals), Owner ([<u>Zoho
standard
fields</u>](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/standard-modules-fields)).

Configuration:

- Fiscal year start month.

- Period type: Monthly or Quarterly.

- Hierarchy: Role or Territory.

- Metric: Deal Amount, Expected Revenue or Quantity.

- Target per user per period, which rolls up the hierarchy.

Computed per user per period, from deals whose Closing_Date falls in the
period:

- Achieved = Σ Closed Won.

- Committed = Σ forecast category Committed.

- Best Case = Committed + Σ Best Case.

- Pipeline = Σ open.

- Gap = Target − Achieved.

**2.12 Campaigns (optional)**

Name (required), Owner, Type, Status, Start/End Date, Expected Revenue,
Budgeted Cost, Actual Cost, Expected Response %, Num Sent, Description.
Campaigns have M:N links to Leads and Contacts, each with a member
status (Planned, Invited, Sent, Received, Opened, Responded, Bounced,
Opted Out). Deals reference a campaign through Campaign_Source.

**3. Core workflows**

**3.1 Lead conversion**

UI: on the Lead detail page, the **Convert** button opens the conversion
form.

Inputs:

1.  Account: create a new one from Company, or attach an existing match.

2.  Contact: create a new one, or attach an existing match.

3.  The "Create a new Deal" checkbox. When ticked it shows Deal Name
    (defaults to Company), Closing Date, Pipeline, Stage, Contact Role,
    Amount, Campaign Source and Owner.

4.  Assign To (new owner, optional).

5.  Option to carry over notes, attachments and activities.

The UI flow and the "Deal Name defaults to Company Name" behaviour are
documented in [<u>Converting
Leads</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/leads/articles/convert-leads).

Duplicate matching runs before conversion and follows Zoho's order of
preference ([<u>Convert Lead API
v8</u>](https://www.zoho.com/crm/developer/docs/api/v8/convert-lead.html)):

- No unique fields configured: match lead Email against Contacts.Email,
  then Company against Accounts.Account_Name, then the lead's name
  against Contacts.

- Unique fields configured: check Contacts first, then Accounts, using
  their unique fields. If only Accounts has a unique field, check
  Accounts first.

Rules:

- A Contact is always created or linked.

- An Account is created only if Company is present.

- A Deal is optional ([<u>iOS conversion
  help</u>](https://help.zoho.com/portal/en/kb/crm/crm-mobile/apple/record-management-and-actions/articles/converting-leads-in-zoho-crm-ios-app)).
  Note that the desktop FAQ says conversion always creates an Account
  and Contact ([<u>Account
  FAQ</u>](https://help.zoho.com/portal/en/kb/crm/faqs/sales-force-automation/account-management/articles/account-management)).
  Make "Account required" a setting.

- Field values move according to the **Lead Conversion Mapping** table
  (lead field → account field, contact field, deal field). Mapped fields
  must share the same type and a compatible length ([<u>Converting
  Leads</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/leads/articles/convert-leads)).
  Mapping can be set per layout.

- Default mapping:

  - First/Last Name, Email, Phone, Mobile, Title, Salutation, Address,
    Description → Contact.

  - Company, Industry, Annual Revenue, No. of Employees, Website, Phone
    → Account.

  - Lead Source → Contact and Deal.

  - Owner → all new records.

- Conversion runs in one transaction, is one-way, and cannot be undone
  ([<u>Account
  FAQ</u>](https://help.zoho.com/portal/en/kb/crm/faqs/sales-force-automation/account-management/articles/account-management)).
  The lead is flagged as converted, hidden from default Leads views, and
  shown in a "Converted Leads" view.

- The Lead's notes, attachments, open activities, emails and campaign
  memberships are re-parented to the new Contact (or the Deal for
  deal-specific items).

- Response: {account_id, contact_id, deal_id\|null}.

API: POST /Leads/{id}/actions/convert.

**3.2 Deal pipeline progression**

- Kanban view grouped by Stage, scoped to one pipeline. Each column
  header shows the deal count and Σ Amount. Dragging a card changes the
  Stage.

- On a Stage change:

  1.  Apply the probability and forecast category defaults.

  2.  Write a Stage History row.

  3.  If the new stage is Closed Lost, require Reason for Loss.

  4.  If the new stage is Closed Won, set Probability to 100 and
      Forecast Category to Closed.

- On the detail page, a stage transition strip shows the stages in
  order, highlights the current one, and records the time spent in each.

**3.3 Quote → Order → Invoice**

- From the Deal detail page, the related lists offer New Quote and New
  Sales Order ([<u>Creating
  Deals</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/deal-management/articles/create-deals)).
  The new record is pre-filled with the Account, Contact, Deal and the
  Account's addresses.

- Quote actions: Convert → Sales Order / Invoice, Print / PDF
  (template), Send Email (template plus PDF attachment), Clone.

- Optional automation: when the Quote Stage becomes Closed Won, offer to
  set the Deal Stage to Closed Won.

**3.4 Activities and timeline**

- Every record has a **Timeline** of field updates, stage changes,
  notes, emails, activities created or completed, and conversions,
  newest first.

- "Open Activities" and "Closed Activities" related lists each have a
  +Task, +Meeting and +Call quick-create button.

- Reminders and notification emails are sent through a job queue.

**4. Screens**

|                                 |                                                                                                                                                                                                                                                                                                                                                   |
|---------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Screen                          | Contents                                                                                                                                                                                                                                                                                                                                          |
| **Sales Home**                  | Greeting. Widgets: My Open Tasks, Today's Meetings, My Open Deals (Σ amount), Deals Closing This Month, Pipeline by Stage (funnel), Leads by Source (donut), Forecast vs Target gauge. Widget layout is configurable per user/role.                                                                                                               |
| **List view** (each module)     | Custom views (system: All, My, Today's, Converted, Recently Created/Modified, Unread — scoped per module). Filter sidebar by field. Column chooser, sort, pagination (10/20/50/100/200), bulk select. Bulk actions: Mass Update, Mass Delete, Mass Email, Change Owner, Add Tags, Export CSV, Print, Add to Campaign. Search box.                 |
| **Kanban view**                 | Deals by Stage. Any module grouped by a picklist.                                                                                                                                                                                                                                                                                                 |
| **Create / Edit form**          | Layout-driven sections. Required-field validation, lookup pickers with search and "+ new", address copy, picklist dependencies, field-level permissions (hidden or read-only). Save, Save & New, Cancel.                                                                                                                                          |
| **Detail view**                 | Header (name, owner, key fields, tags, action buttons: Edit, Convert (Leads), Send Email, Clone, Delete, Print). Stage strip (Deals). Tabs: Overview (fields by section), Timeline. Related lists: Notes, Attachments, Open/Closed Activities, Emails, Contacts, Deals, Quotes, SOs, Invoices, Products, Campaigns, Stage History, Contact Roles. |
| **Convert Lead**                | See 3.1.                                                                                                                                                                                                                                                                                                                                          |
| **Quote / SO / Invoice editor** | Header form plus a line-item grid (add row, product search, inline price book pick, reorder rows) plus a live totals footer. PDF preview.                                                                                                                                                                                                         |
| **Forecasts**                   | Period selector. Hierarchy tree (role or territory). Per-row Target, Achieved, Committed, Best Case, Pipeline, Gap, progress bar. Drill-down to deals.                                                                                                                                                                                            |
| **Reports**                     | Tabular, summary and matrix reports with a module-join picker, filters, group-by and charts. Seed reports: Deals by Stage, Pipeline by Owner, Lead Conversion Rate, Sales by Account, Lost Deals by Reason, Activities by Owner.                                                                                                                  |
| **Setup**                       | Modules & Fields (layout editor, custom fields, picklist editor), Stage-Probability Mapping, Pipelines, Lead Conversion Mapping, Quote/SO Conversion Mapping, Users/Roles/Profiles, Assignment Rules, Workflow Rules, Approval Processes, Currencies, Taxes, Fiscal Year, Templates (email/print).                                                |

**5. Security model**

- **Users**, each with one **Role** (a tree hierarchy) and one
  **Profile** (permission set).

- Profile permissions: module CRUD (View, Create, Edit, Delete), Import,
  Export, Mass Update, Convert Lead, Change Owner, Manage Setup, and
  field-level access (read/write, read-only, hidden).

- Record visibility through **data sharing rules**, per module: Private
  (owner plus upward hierarchy), Public Read Only, or Public
  Read/Write/Delete. Optional "grant access using hierarchy". Optional
  territory-based sharing.

- **Groups** and rule-based sharing (share records matching criteria
  with a role or group).

- Approval lock: a record under approval is read-only to non-approvers.

- Every query is filtered server-side by visibility. Never rely on
  hiding things in the UI.

**6. Automation engine**

|                     |                                                                                                                                                                                                                                                                    |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Feature             | Behaviour                                                                                                                                                                                                                                                          |
| Assignment rules    | On Lead/Deal create, including web-form and import: evaluate criteria in order, then assign an owner (specific user, round-robin across users, or by territory).                                                                                                   |
| Workflow rules      | Trigger: create, edit, create-or-edit, field update, delete, or date-based (X days before/after a date field). Criteria builder. Actions: field update, email notification (template), create task, webhook, call a custom function. Instant or scheduled actions. |
| Validation rules    | Criteria-based. Block save with a message.                                                                                                                                                                                                                         |
| Approval process    | Criteria, then an ordered approver chain (user, role or manager). Approve/reject with comments. Record is locked while pending.                                                                                                                                    |
| Blueprint (Phase 2) | State machine on a picklist field (for example Deal Stage). Transitions have owners, before/during/after conditions, required fields and checklists.                                                                                                               |
| Scoring (optional)  | Rules adding or removing points on Leads/Contacts based on field values and engagement.                                                                                                                                                                            |

Implement the engine as an event bus. Record events go to a rule
evaluator, which pushes actions onto a job queue (with retries and an
audit log).

**7. API (mirror Zoho's REST shape)**

Base: /api/v1. Paths use module API names.

GET /settings/modules  
GET /settings/fields?module=Deals  
GET /settings/layouts?module=Deals  
GET /settings/related_lists?module=Deals  
GET /settings/pipeline?layout_id=  
GET /{Module}?fields=&sort_by=&sort_order=&page=&per_page=&cvid=  
GET /{Module}/{id}  
POST /{Module} {data:\[{...}\], trigger:\["workflow","approval"\]}  
PUT /{Module} (bulk update, max 100)  
PUT /{Module}/{id}  
DELETE /{Module}?ids=  
GET
/{Module}/search?criteria=((Email:equals:x@y.com)and(Stage:starts_with:Neg))&word=&email=&phone=  
GET /{Module}/{id}/{RelatedList}  
PUT /{Module}/{id}/{RelatedList}/{related_id}  
POST /Leads/{id}/actions/convert  
GET /Leads/{id}/\_\_conversion_options  
POST /Quotes/{id}/actions/convert {to:"Sales_Orders"\|"Invoices"}  
GET /{Module}/{id}/timeline  
POST /{Module}/actions/mass_update

Response envelope: {data:\[...\], info:{page, per_page, count,
more_records}}. Error shape: {code, message, details:{api_name},
status}.

Reference: [<u>Zoho CRM v8 API
index</u>](https://www.zoho.com/crm/developer/docs/api/v8/api-references.html),
[<u>Get
Records</u>](https://www.zoho.com/crm/developer/docs/api/v8/get-records.html),
[<u>Field
metadata</u>](https://www.zoho.com/crm/developer/docs/api/v8/field-meta.html),
[<u>Layouts
metadata</u>](https://www.zoho.com/crm/developer/docs/api/v8/layouts-meta.html).

**8. Metadata-driven architecture (key design decision)**

Zoho's power comes from module, field and layout metadata. Rebuild it
the same way:

- Tables: modules, fields (module_id, api_name, label, data_type,
  length, required, unique, default, picklist_id, lookup_module,
  formula, read_only), picklists / picklist_values (with category and
  order), layouts, layout_sections, layout_fields, field_permissions
  (profile × field).

- Record storage: either one table per module (generated through
  migrations when fields are added), or a typed EAV/JSONB
  records(module_id, id, data jsonb) with generated indexes on hot
  fields. **Recommended:** standard modules get real tables for the core
  fields, plus a custom jsonb column. Custom modules use JSONB.

- The form, detail, list and filter UIs all render from metadata.
  Nothing is hard-coded per module except special behaviours (Lead
  convert, Deal stages, line items, forecasts).

Data types to support: Single line, Multi line, Email, Phone, URL,
Picklist, Multi-select, Date, DateTime, Integer, Decimal, Currency,
Percent, Boolean, Long Integer, Auto-number, Formula, Lookup,
Multi-select lookup, User lookup, Subform, File upload, Image, Rollup
summary.

**9. Suggested tech stack**

- **Backend:** Node.js (NestJS) or Python (FastAPI). PostgreSQL 16
  (JSONB, generated columns, row-level security optional). Redis plus
  BullMQ/Celery for workflows and reminders. S3-compatible storage for
  attachments.

- **Frontend:** React and TypeScript, TanStack Table (lists), dnd-kit
  (kanban), React Hook Form with Zod (metadata-driven forms),
  Recharts/ECharts (dashboards).

- **Auth:** OIDC/JWT plus org multi-tenancy (org_id on every row).

- **PDF:** Headless Chromium or a templating engine for quotes and
  invoices.

- **Search:** Postgres full-text search to start; OpenSearch later.

**10. Build phases**

|                           |                                                                                                                                                                     |
|---------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Phase                     | Deliverables                                                                                                                                                        |
| 1\. Foundation            | Tenancy, users, roles, profiles, metadata engine, generic list/detail/form, audit and timeline.                                                                     |
| 2\. Sales core            | Leads, Accounts, Contacts, Deals with seed fields and picklists, stage-probability mapping, pipelines, kanban, lead conversion with duplicate matching and mapping. |
| 3\. Activities            | Tasks, Meetings, Calls, reminders, related lists, Home widgets.                                                                                                     |
| 4\. CPQ                   | Products, Price Books, Quotes, Sales Orders, Invoices, line-item engine, conversions, PDF and email templates, taxes, currencies.                                   |
| 5\. Forecasts and reports | Forecast config, targets, hierarchy roll-up, report builder, dashboards.                                                                                            |
| 6\. Automation            | Assignment rules, workflow rules, validation, approvals, webhooks, then Blueprint.                                                                                  |
| 7\. Extras                | Campaigns, Vendors, Purchase Orders, import/export wizard, REST API keys, web-to-lead form.                                                                         |

**11. Acceptance tests (minimum)**

1.  Creating a Lead without Last Name or Company fails with field-level
    errors.

2.  Converting a Lead with Company "Acme" when no Account "Acme" exists
    creates 1 Account, 1 Contact and 1 Deal. Deal_Name defaults to
    "Acme". The lead is flagged converted and appears only in "Converted
    Leads". Notes and activities move to the Contact.

3.  Converting a Lead whose Email matches an existing Contact offers
    "attach to existing". Choosing it creates no duplicate Contact.

4.  Converting with "Create Deal" unticked creates no Deal.

5.  Changing a Deal's Stage from Qualification to Proposal/Price Quote
    sets Probability to 75. Expected Revenue equals Amount × 0.75. A
    Stage History row is written.

6.  Moving a Deal to Closed Lost without Reason for Loss is blocked.

7.  A Quote with 2 rows (qty 3 × 100 with 10% discount, and qty 1 × 50
    at 18% tax) computes: row1 Total = 270, row2 Total = 59, Sub Total
    = 329. A header adjustment of −9 gives a Grand Total of 320.

8.  Converting a Quote to a Sales Order copies all line items, the
    addresses and the account/contact/deal, and links SO.Quote =
    [<u>quote.id</u>](http://quote.id).

9.  A user with a "Private" Deals sharing rule cannot GET another rep's
    deal unless they are above that rep in the role hierarchy.

10. A forecast for Q3: deals with Closing_Date in Q3 roll into Achieved,
    Committed, Best Case and Pipeline according to forecast category.
    Manager totals equal the sum of their reports.

11. A workflow rule (Deal Amount \> 100000 on create triggers a task for
    the owner) creates exactly one task.

12. Changing the Deals pipeline on a layout restricts the Stage picklist
    to that pipeline's stages.

**12. Closing the gap with your actual org**

To turn this into an **observed-behaviour** spec of org 60093287285, any
one of these works:

1.  **Authorise the Zoho CRM connector.** I can then read
    /settings/modules, /settings/fields, /settings/layouts,
    /settings/pipeline, the related lists and custom views for every
    Sales module, and add your custom fields, picklist values, stages
    and layouts to sections 2–4.

2.  **Export metadata yourself:** Setup → Developer Hub → APIs, or run
    the Modules, Fields and Layouts API calls with a self-client token,
    and share the JSON.

3.  **Share screenshots** of Setup → Modules and Fields (each Sales
    module's layout), Stage-Probability Mapping, Lead Conversion
    Mapping, and Workflow / Assignment / Blueprint lists.

Items most likely to differ in your org: renamed modules, custom fields,
number of pipelines, stage names and probabilities, Lead Status and
Source values, blueprints, Deluge custom functions, the Zoho
Books/Finance integration (Finance tab instead of native
Quotes/Invoices), and Indian GST tax setup.

**13. Ready-to-paste build prompt**

> You are a senior full-stack engineer. Build a multi-tenant,
> metadata-driven Sales CRM web application that functionally replicates
> the standard Sales area of Zoho CRM, without using any Zoho branding,
> assets or code.
>
> **Stack:** PostgreSQL 16, Node.js + NestJS (or FastAPI), Redis job
> queue, React + TypeScript + TanStack Table + dnd-kit + React Hook
> Form/Zod + ECharts. OIDC/JWT auth. Every row carries org_id.
>
> **Metadata engine first:** tables for modules, fields (api_name,
> label, type, length, required, unique, default, picklist, lookup
> target, formula, read-only), picklists with ordered values and a
> category (Open/Success/Failed), layouts → sections → fields, and
> per-profile field permissions. Lists, filters, create/edit forms and
> detail pages must render entirely from this metadata. Supported field
> types: text, textarea, email, phone, url, picklist, multiselect, date,
> datetime, integer, decimal, currency, percent, boolean, autonumber,
> formula, lookup, user lookup, subform, file.
>
> **Seed modules and fields** exactly as listed in sections 2.3–2.12 of
> the attached spec: Leads, Accounts, Contacts, Deals, Tasks, Meetings,
> Calls, Products, Price Books, Quotes, Sales Orders, Invoices,
> Forecasts, and optionally Campaigns, Vendors and Purchase Orders.
> Every record has owner, created/modified by/time, tags, layout,
> currency and soft delete.
>
> **Special behaviours:**
>
> **Security:** Roles (tree), Profiles (module CRUD, import/export, mass
> update, convert, field-level access), per-module sharing defaults
> (Private / Read Only / Read-Write-Delete) with hierarchy access, and
> criteria-based sharing rules. All filtering is enforced server-side.
>
> **Automation:** assignment rules (criteria → user, round-robin or
> territory), workflow rules (create/edit/field-update/date triggers →
> field update, email, task, webhook, function; instant or scheduled),
> validation rules, approval processes with record lock. Blueprint state
> machine in Phase 2.
>
> **UI:** Sales Home with widgets (open tasks, today's meetings, open
> deals, closing this month, pipeline funnel, leads by source, forecast
> gauge). List views with custom views, filters, column chooser, bulk
> actions (mass update, delete, change owner, tag, export CSV, email).
> Kanban. Layout-driven forms. Detail pages with related lists. Reports
> (tabular, summary, matrix, charts). A Setup area for every
> configuration above.
>
> **API:** REST mirroring /settings/modules\|fields\|layouts\|pipeline,
> /{Module} CRUD with pagination {data, info:{page, per_page, count,
> more_records}}, /{Module}/search?criteria=(Field:op:value), related
> lists, and convert endpoints.
>
> **Deliver:** a monorepo, DB migrations plus seed data, an OpenAPI
> spec, Docker Compose, and automated tests that cover the 12 acceptance
> tests in section 11 of the spec. Build in the phase order from section
> 10, and keep the app runnable at the end of each phase.

**14. Sources**

- Zoho — Standard Modules & Fields:
  [<u>https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/standard-modules-fields</u>](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/standard-modules-fields)

- Zoho — Standard Fields in Deals:
  [<u>https://help.zoho.com/portal/en/kb/crm/sales-force-automation/deal-management/articles/standard-fields-deals</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/deal-management/articles/standard-fields-deals)

- Zoho — Understand your CRM account:
  [<u>https://help.zoho.com/portal/en/kb/crm/crm-reference/introduction-to-zoho-crm/articles/understand-crm-account</u>](https://help.zoho.com/portal/en/kb/crm/crm-reference/introduction-to-zoho-crm/articles/understand-crm-account)

- Zoho — Converting Leads:
  [<u>https://help.zoho.com/portal/en/kb/crm/sales-force-automation/leads/articles/convert-leads</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/leads/articles/convert-leads)

- Zoho — Converting leads (iOS):
  [<u>https://help.zoho.com/portal/en/kb/crm/crm-mobile/apple/record-management-and-actions/articles/converting-leads-in-zoho-crm-ios-app</u>](https://help.zoho.com/portal/en/kb/crm/crm-mobile/apple/record-management-and-actions/articles/converting-leads-in-zoho-crm-ios-app)

- Zoho — Account Management FAQ:
  [<u>https://help.zoho.com/portal/en/kb/crm/faqs/sales-force-automation/account-management/articles/account-management</u>](https://help.zoho.com/portal/en/kb/crm/faqs/sales-force-automation/account-management/articles/account-management)

- Zoho — Working with Leads:
  [<u>https://help.zoho.com/portal/en/kb/crm/sales-force-automation/leads/articles/leads-26-4-2026</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/leads/articles/leads-26-4-2026)

- Zoho — Convert Lead API v8:
  [<u>https://www.zoho.com/crm/developer/docs/api/v8/convert-lead.html</u>](https://www.zoho.com/crm/developer/docs/api/v8/convert-lead.html)

- Zoho — Modify Special Fields (stage-probability mapping):
  [<u>https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/modify-special-fields</u>](https://help.zoho.com/portal/en/kb/crm/customize-crm-account/customizing-fields/articles/modify-special-fields)

- Zoho — Forecast configuration:
  [<u>https://help.zoho.com/portal/en/kb/crm/sales-force-automation/forecasts/articles/setting-up-forecast-configuration-and-creating-forecasts</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/forecasts/articles/setting-up-forecast-configuration-and-creating-forecasts)

- Zoho — Creating and working with forecasts:
  [<u>https://help.zoho.com/portal/en/kb/crm/sales-force-automation/forecasts/articles/creating-and-working-with-forecasts</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/forecasts/articles/creating-and-working-with-forecasts)

- Zoho — Picklist record categories:
  [<u>https://help.zoho.com/portal/en/kb/crm-nextgen/customize-crm-account/customizing-fields/articles/nextgen-record-category-classify-and-track-record-status-with-picklist-mapping</u>](https://help.zoho.com/portal/en/kb/crm-nextgen/customize-crm-account/customizing-fields/articles/nextgen-record-category-classify-and-track-record-status-with-picklist-mapping)

- Zoho — Inventory Management:
  [<u>https://help.zoho.com/portal/en/kb/crm/manage-inventory/overview/articles/inventory</u>](https://help.zoho.com/portal/en/kb/crm/manage-inventory/overview/articles/inventory)

- Zoho — Creating Quotes:
  [<u>https://help.zoho.com/portal/en/kb/crm/manage-inventory/quotes/articles/create-quotes</u>](https://help.zoho.com/portal/en/kb/crm/manage-inventory/quotes/articles/create-quotes)

- Zoho — Creating Deals:
  [<u>https://help.zoho.com/portal/en/kb/crm/sales-force-automation/deal-management/articles/create-deals</u>](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/deal-management/articles/create-deals)

- Zoho One — Deal management guide:
  [<u>https://www.zoho.com/one/guides/dealmanagement.html</u>](https://www.zoho.com/one/guides/dealmanagement.html)

- Zoho — Modules API v8:
  [<u>https://www.zoho.com/crm/developer/docs/api/v8/modules-api.html</u>](https://www.zoho.com/crm/developer/docs/api/v8/modules-api.html)

- Zoho — API references v8:
  [<u>https://www.zoho.com/crm/developer/docs/api/v8/api-references.html</u>](https://www.zoho.com/crm/developer/docs/api/v8/api-references.html)

- Zoho — Get Records v8:
  [<u>https://www.zoho.com/crm/developer/docs/api/v8/get-records.html</u>](https://www.zoho.com/crm/developer/docs/api/v8/get-records.html)

- Zoho — Field metadata v8:
  [<u>https://www.zoho.com/crm/developer/docs/api/v8/field-meta.html</u>](https://www.zoho.com/crm/developer/docs/api/v8/field-meta.html)

- Zoho — Layouts metadata v8:
  [<u>https://www.zoho.com/crm/developer/docs/api/v8/layouts-meta.html</u>](https://www.zoho.com/crm/developer/docs/api/v8/layouts-meta.html)

- Zoho — Create Custom Field v8:
  [<u>https://www.zoho.com/crm/developer/docs/api/v8/create-custom-field.html</u>](https://www.zoho.com/crm/developer/docs/api/v8/create-custom-field.html)

- CodeStringers — Zoho stage probability defaults:
  [<u>https://www.codestringers.com/videos/zoho-crm-stage-probability-forecast</u>](https://www.codestringers.com/videos/zoho-crm-stage-probability-forecast)
