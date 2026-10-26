# PRD — Saqient Sales CRM

Status: **Approved** (2026-10-27) · Last updated: 2026-10-27
Domain reference: `docs/reference/zoho-crm-sales-module-rebuild.md` · Architecture: `docs/TRD.md` · Schema: `docs/SCHEMA.md`

## 1. Problem

Saqient's sales team (4 reps, 1 manager) runs its sales cycle in Zoho CRM. We want to own that system, for two reasons:

- **Fit for Oman.** Quotes and invoices must apply Oman VAT per line (5% standard, zero-rated, exempt). They must use OMR to 3 decimals as the base currency, with AED and INR on individual records. Invoices may need to be bilingual (Arabic + English) and ready for Oman e-invoicing.
- **Future product.** The working assumption, not yet a final decision, is that this becomes a multi-tenant CRM sold to Gulf SMBs. Saqient's own team is the first tenant and the proving ground.

The MVP must let our reps run the whole sales cycle (Lead → Deal → Quote → Sales Order → Invoice) without Zoho. It must be built so that onboarding a second company later needs no schema rewrite.

## 2. Personas

| Persona | Count (MVP) | Needs | Sees |
|---|---|---|---|
| **Sales Rep** | 4 | Capture and qualify leads, work deals through stages, raise quotes, sales orders and invoices, send them to customers by email or WhatsApp, log activities | Own Deals, Quotes, Sales Orders, Invoices; **all** Accounts and Contacts |
| **Sales Manager** | 1 | Pipeline and forecast for the team in OMR, set quarterly targets, step in on any team deal | Everything owned by their team |
| **Admin** | 1 (may be the manager) | Users and roles, products and their VAT categories, exchange rates, org settings (VAT number, invoice numbering), CSV import from Zoho | Everything in the org |
| **Customer** (not a user) | — | Receive a correct, readable Quote or Invoice PDF by email or WhatsApp link | Only the PDF behind a secure, expiring link |
| **Future tenant admin** (Phase 2+) | — | Same as Admin, for their own company | Their org only. Today this is a design constraint, not a user |

## 3. Goals and non-goals

### Goals (MVP)

- **G1. Full cycle in-house.** Reps run Lead → Deal → Quote → Sales Order → Invoice in the CRM, and Zoho is no longer used for sales.
- **G2. Correct money.** The server computes all line, tax and total amounts; client-side totals are never trusted.
  - VAT is applied per line by product category (standard 5%, zero-rated, exempt).
  - Amounts are held in the record's currency (OMR 3 dp; AED or INR 2 dp).
  - Each record stores the exchange rate in force when it was created, so its OMR value never changes afterwards.
- **G3. Enforced visibility.** Every query is scoped by `org_id` and by role and sharing rules on the server. Deals, Quotes, Sales Orders and Invoices are private to their owner and the owner's managers. Accounts and Contacts are visible to the whole org.
- **G4. Tenant-ready.** Every row carries `org_id`. The data model is metadata-driven (fields and layouts defined as data), so the custom-field UI and a second tenant can be added later without a rewrite.
- **G5. Operable.**
  - **Uptime:** 99.5% during Oman business hours (Sun–Thu).
  - **RPO 1 h:** backups run at least hourly.
  - **RTO 4 h:** service is restored within 4 hours of an incident.
  - **Speed:** list and detail pages load in under 1 s at the 95th percentile.
  - **Capacity:** sized for 50 tenants × 50 users × 100k records each.
  - **Hosting:** a GCC region (AWS Bahrain or UAE, or an Oman provider if one is available).
- **G6. Ready for Arabic, usable on phones.**
  - All UI strings are loaded from translation files, with no hard-coded text, so Arabic can be added later.
  - Layouts use logical CSS properties (start/end rather than left/right) so they can switch to RTL.
  - Every MVP screen is fully usable on a 360 px-wide phone.

### Non-goals (MVP)

- Self-serve tenant signup, subscription billing, tenant provisioning UI
- Price Books (each line uses the product's list price plus a per-line discount)
- Workflow rules and automation engine
- Admin UI for custom fields and layouts (the data model supports them; the UI waits for Phase 2)
- WhatsApp Business API and two-way chat (the MVP uses `wa.me` click-to-chat only)
- Gmail/Outlook sync, calendar sync, accounting sync
- Automatic exchange-rate feeds (Admin enters rates by hand)
- Arabic app UI (the MVP UI is English-only; Arabic is limited to the Quote and Invoice PDFs, pending an open question)
- Payment collection and reconciliation (an Invoice's paid/unpaid status is updated by hand)
- Native mobile apps (the web app is responsive, see G6)

## 4. User stories and acceptance criteria

The reference spec's 12 acceptance tests (§11) are mapped where they apply and changed from GST to Oman VAT. Items marked ⚠ were assumptions; they were confirmed as MVP decisions on 2026-10-27. The VAT treatment of the Adjustment still needs the accountant's confirmation (see OQ-04).

### E1. Access and tenancy

**US-01. Sign in and stay in my org.** As any user, I sign in with email and password and see only my organisation's data.
- **Given** users seeded in org *Saqient* and org *Demo*, **when** a Saqient user requests any Demo record by ID, **then** the API returns 404 and the response reveals nothing about the record.
- **Given** a deactivated user, **when** they try to sign in, **then** sign-in is refused and the records they own remain unchanged.

**US-02. Private deals, public accounts.** As a Rep, I see my own Deals, Quotes, Sales Orders and Invoices, plus all Accounts and Contacts. *(Ref test 9)*
- **Given** Rep A owns Deal D, **when** Rep B lists Deals or GETs D, **then** D is absent from the list and the GET returns 404.
- **Given** Rep A's manager is above A in the role hierarchy, **when** the manager GETs D, **then** it returns 200.
- **Given** Rep A created Account X, **when** Rep B searches Accounts, **then** X is found.
- **Given** any list, search, report, forecast, export or PDF endpoint, **when** it is called, **then** the same visibility filter is applied on the server.

**US-03. Manage users and ownership.** As an Admin, I invite users, assign the Admin, Manager or Rep role and a reporting manager, deactivate users, and transfer a user's records to another owner.
- **Given** a Rep is being deactivated, **when** the Admin transfers their records to Rep C, **then** every open Lead, Deal, Quote, Sales Order and Activity they owned is owned by C, and the transfer appears on each record's timeline.

### E2. Leads

**US-04. Capture a lead.** As a Rep, I create a lead with at least Last Name and Company. *(Ref test 1)*
- **Given** a lead form without Last Name or Company, **when** it is submitted, **then** the save fails with a field-level error on each missing field, in both the UI and the API (validated with the shared Zod schema).

**US-05. Convert a lead.** As a Rep, I convert a qualified lead into an Account, a Contact and, optionally, a Deal, in one step. *(Ref tests 2–4)*
- **Given** Lead L with Company "Acme" and no Account "Acme", **when** L is converted with "Create Deal" ticked, **then** exactly 1 Account, 1 Contact and 1 Deal are created, and the Deal Name defaults to "Acme".
- After that conversion, L is flagged as converted and appears only in "Converted Leads", and L's notes and activities now belong to the Contact.
- **Given** L's Email matches an existing Contact, **when** the convert dialog opens, **then** it offers "attach to existing", and choosing that creates no new Contact.
- **Given** "Create Deal" is unticked, **when** L is converted, **then** no Deal is created.
- **Given** any step of the conversion fails, **when** the conversion is rolled back, **then** no partial Account, Contact or Deal remains (the conversion runs in a single transaction).
- **Given** a converted lead, **when** a user tries to convert or edit it, **then** the action is refused.

### E3. Accounts and Contacts

**US-06. Maintain customers.** As a Rep, I create and edit Accounts (including the customer's VAT number) and their Contacts (including a mobile number in international format).
- **Given** a Contact's mobile is entered as "9xxx xxxx" with country Oman, **when** it is saved, **then** it is stored in E.164 format (+968…).
- **Given** an Account, **when** I open it, **then** I see its Contacts, Deals, Quotes, Sales Orders, Invoices and Activities, each filtered by my visibility.

### E4. Deals and pipeline

**US-07. Move deals through stages.** As a Rep, I move a deal between stages on a Kanban board or the detail page, and probability and forecast category follow automatically. *(Ref tests 5–6)*
- **Given** Deal D (Amount 10,000.000 OMR) at Qualification, **when** it moves to Proposal/Price Quote, **then** Probability = 75, Expected Revenue = 7,500.000, and a Stage History row is written.
- **Given** a move to Closed Lost without a Reason for Loss, **when** it is saved, **then** it is blocked with a field error.
- **Given** a move to Closed Won, **when** it is saved, **then** Probability = 100 and Forecast Category = Closed.
- **Given** the Kanban board, **when** it renders, **then** each column shows the deal count and Σ Amount in OMR.
- ⚠ The MVP has one pipeline, seeded with the reference spec's stage table (§2.7). Editing stages and adding further pipelines come in Phase 2 with the admin UI.

### E5. Products, VAT and currency

**US-08. Maintain products with a VAT category.** As an Admin, I maintain products with a code, a unit price in OMR and a VAT category: Standard (5%), Zero-rated or Exempt.
- **Given** a product without a VAT category, **when** it is saved, **then** it is rejected.
- **Given** the standard VAT rate is stored as org configuration (not a constant), **when** the rate changes in future, **then** new documents use the new rate and existing documents keep the rate stored on them.

**US-09. Set exchange rates.** As an Admin, I enter the OMR rate for AED and INR with an effective date.
- **Given** the rate 1 AED = 0.105 OMR is effective today, **when** a Rep creates a Quote in AED, **then** the Quote stores rate 0.105, and later rate changes do not alter its OMR equivalent.
- **Given** a draft whose currency is changed, **when** it is saved, **then** the current rate is captured again.
- **Given** a currency with no effective rate, **when** a Rep tries to create a record in it, **then** creation is blocked with a clear message.
- ⚠ When a product priced in OMR is added to an AED or INR document, the list price defaults to OMR price ÷ rate, rounded to 2 dp, and the Rep can edit it.

### E6. Quotes, Sales Orders, Invoices

**US-10. Build a quote with correct VAT.** As a Rep, I create a Quote from a Deal with line items, and the server computes every total. *(Ref test 7, changed to Oman VAT)*

Worked example, Quote in OMR:

| Line | Product (VAT category) | Qty × Price | Discount | After discount | VAT | Line total |
|---|---|---|---|---|---|---|
| 1 | A (Standard 5%) | 3 × 100.000 | 10% | 270.000 | 13.500 | 283.500 |
| 2 | B (Zero-rated) | 1 × 50.000 | — | 50.000 | 0.000 | 50.000 |
| 3 | C (Exempt) | 2 × 12.345 | — | 24.690 | — | 24.690 |

- **Given** the three lines above, **then** Sub Total = 358.190 and the VAT summary shows Standard base 270.000 / VAT 13.500, Zero-rated base 50.000 and Exempt base 24.690.
- **Given** a header Adjustment of −0.190, **then** Grand Total = 358.000.
- **Given** a client that sends its own totals, **when** the Quote is saved, **then** they are ignored and the totals are recomputed on the server.
- **Given** an AED Quote, **then** amounts round to 2 dp, and the OMR equivalent (3 dp) is stored using the Quote's rate.
- **Given** a Quantity ≤ 0 or a missing Product, **then** the save is rejected.
- ⚠ VAT is computed and rounded per line, half-up, to the currency's precision.
- ⚠ The MVP has no header-level discount (discounts are per line only).
- ⚠ The Adjustment does not carry VAT. The accountant needs to confirm this (see Open Questions).

**US-11. Convert Quote → Sales Order → Invoice.** As a Rep, I convert an accepted Quote to a Sales Order, and a Sales Order to an Invoice, without retyping. *(Ref test 8)*
- **Given** Quote Q, **when** it is converted to a Sales Order, **then** all line items, addresses, the Account, Contact and Deal, the currency and the stored exchange rate are copied, and `SO.quote_id = Q.id`.
- The same holds for Sales Order → Invoice, with `Invoice.sales_order_id` set.
- **Given** a Quote is converted, **then** its stored rate is carried over and is not re-captured.

**US-12. Issue a compliant tax invoice.** As a Rep, I issue an Invoice that meets Oman VAT invoice requirements.
- **Given** a new Invoice, **when** it is issued, **then** it receives the next number in an org-wide sequence that has no gaps and never reuses a number.
- **Given** an issued Invoice, **then** its lines and totals are locked. It can only be cancelled, and the cancelled invoice keeps its number.
- **Given** an issued Invoice's PDF, **then** it shows "Tax Invoice", the seller's name, address and VATIN, the buyer's name and VATIN (if any), the invoice date and number, per-line VAT, a VAT summary by category, and totals in the document currency with the VAT also in OMR.
- **Given** an Invoice is paid, **when** a user marks it Paid by hand, **then** the status change appears on its timeline.
- ⚠ The PDF layout is English-only until the Arabic and e-invoicing open questions are answered.

### E7. Sending to customers

**US-13. Email a Quote or Invoice.** As a Rep, I email the PDF to the customer from the record.
- **Given** a Contact with an email address, **when** I click Send Email, **then** the PDF is attached, the email is sent over the org's SMTP settings, and an Activity "Email sent to X" is logged on the record.
- **Given** an SMTP failure, **then** the user sees an error, and no "sent" activity is logged.

**US-14. Send on WhatsApp.** As a Rep, I share the PDF over WhatsApp from my phone or desktop.
- **Given** a Contact with a mobile number, **when** I click Send on WhatsApp, **then** `https://wa.me/<E.164 number>?text=<pre-filled message>` opens. The message contains a link to the PDF built from a random, unguessable token.
- That click logs an Activity "WhatsApp link shared". It records that the link was shared, not that the message was delivered (`wa.me` cannot confirm delivery).
- **Given** a link token, **then** it opens only that one PDF and nothing else, without signing in. It expires after ⚠ 7 days and can be revoked from the record. An expired or revoked token shows a "link expired" page.
- **Given** a Contact with no mobile number, **then** the button is disabled and explains why.

### E8. Activities and timeline

**US-15. Plan and log my work.** As a Rep, I create Tasks, Calls and Meetings linked to a Lead, Contact, Account, Deal, Quote, Sales Order or Invoice, and I see my open and overdue items.
- **Given** a Task due yesterday and still open, **when** I open My Activities, **then** it appears as overdue.
- **Given** a record, **when** its timeline renders, **then** it shows field changes, stage changes, conversions, sends and activities, newest first.
- ⚠ Email and push reminders for activities are Phase 2. The MVP shows overdue items in-app only.

### E9. Forecasts

**US-16. See the quarter in OMR.** As a Manager, I set a quarterly target per Rep and see each Rep's forecast, plus a team total. *(Ref test 10)*
- **Given** deals with a Closing Date in Q3, **then** for each Rep:
  - Achieved = Σ Closed Won
  - Committed = Σ forecast category Committed
  - Best Case = Committed + Σ Best Case
  - Pipeline = Σ open
  - Gap = Target − Achieved
  - Every sum uses Deal Amount converted to OMR at each deal's stored rate.
- **Given** the team view, **then** the Manager's totals equal the sum of their reports.
- **Given** a Rep views the forecast, **then** they see only their own row.
- ⚠ The fiscal year starts in January.

### E10. Migration from Zoho

**US-17. Import our Zoho data.** As an Admin, I import CSV exports of Leads, Accounts, Contacts, Deals and Products.
- **Given** a CSV and a column mapping, **when** I run an import, **then** a dry run runs first and reports a row count and the errors per row, and nothing is written until I confirm.
- **Given** rows with errors, **when** I confirm the import, **then** the valid rows are imported and the failed rows can be downloaded with their error messages. No row fails silently.
- **Given** the same file is imported twice, **then** no duplicates are created. Rows are matched on the stored Zoho record ID.
- **Given** a Zoho owner email, **then** it maps to a CRM user. If there is no match, the row is assigned to the importing Admin and flagged.
- **Given** a related record named in a row, **then** Contacts and Deals link to their Account (and Deals to their Contact) by Zoho ID, falling back to the name.

### E11. Cross-cutting (applies to every story)

- **Phone:** **Given** a 360 px-wide phone, **when** a Rep completes US-05, US-07, US-10, US-13 and US-14, **then** no horizontal scrolling is needed and every control is reachable (verified in the E2E suite at mobile viewport).
- **i18n:** **Given** the UI codebase, **then** a lint rule fails on any hard-coded user-facing string, and layouts use logical CSS properties (start/end).
- **Speed:** **Given** a tenant seeded with 100k records, **then** list and detail API responses are p95 < 1 s.
- **API:** **Given** any endpoint, **then** input is validated with the shared Zod schemas, and the endpoint is in the OpenAPI spec with tests.

## 5. MVP cut

### In the MVP, in build order

Each slice is built end to end (DB → API → UI → tests) and is usable before the next one starts.

| # | Slice | Stories | Depends on |
|---|---|---|---|
| 1 | Foundation: orgs, users, roles and hierarchy, server-side visibility filter, metadata-driven field model, timeline/audit, i18n scaffolding, seeded test users | US-01, US-03, E11 | — |
| 2 | Accounts and Contacts | US-06, US-02 (public rule) | 1 |
| 3 | Activities and timeline UI | US-15 | 2 |
| 4 | Leads and conversion | US-04, US-05 | 2, 3 |
| 5 | Deals and pipeline (one seeded pipeline, Kanban) | US-07, US-02 (private rule) | 2 |
| 6 | Products, VAT config, currencies and exchange rates | US-08, US-09 | 1 |
| 7 | Quotes and the server-side pricing engine | US-10 | 5, 6 |
| 8 | Sales Orders and Invoices (conversion, numbering, locking, PDF) | US-11, US-12 | 7 |
| 9 | Sending: SMTP email and WhatsApp links | US-13, US-14 | 8 |
| 10 | Forecasts | US-16 | 5 |
| 11 | Zoho CSV import and cutover | US-17 | 2, 4, 5, 6 |

**Go-live gate:**
- All stories pass their acceptance criteria.
- A backup restore drill succeeds: the restore takes ≤ 4 h and loses ≤ 1 h of data.
- The Zoho import is reconciled (see M2).

### Phase 2 and later

- Price Books
- Workflow rules and automation (reference test 11)
- Custom field and layout admin UI
- Stage editor and multiple pipelines (reference test 12)
- WhatsApp Business API with two-way chat
- Gmail/Outlook sync, calendar sync, accounting sync
- Email and push activity reminders
- Automatic exchange-rate feed
- Arabic UI (RTL)
- Arabic or bilingual PDFs and e-invoicing submission (pending OQ-01 and OQ-02)
- Payment recording and reconciliation
- Self-serve tenant signup and subscription billing
- Native mobile apps
- Purchase Orders, Campaigns

## 6. Success metrics

| # | Metric | Target |
|---|---|---|
| M1 | Adoption | All 4 reps create every new Lead, Deal and Quote in the CRM within 2 weeks of go-live; no new sales records in Zoho after day 30 |
| M2 | Migration completeness | 100% of exported Zoho rows are either imported or listed in the error report with a reason; 20 randomly sampled records match Zoho field-for-field |
| M3 | Money correctness | 0 issued Invoices needing correction because of VAT, rounding or currency errors in the first 90 days |
| M4 | Access control | 0 cross-org or cross-rep data exposures; every endpoint has an automated visibility test |
| M5 | Reliability | ≥ 99.5% uptime during business hours; restore drill passed before go-live and every quarter after |
| M6 | Speed | p95 < 1 s for list and detail APIs at the 100k-record seed |
| M7 | Phone usability | A Rep can create a Quote from a Deal and send it on WhatsApp from a phone, end to end, with no desktop step |

## 7. Open questions

| # | Question | Owner | Blocks |
|---|---|---|---|
| OQ-01 | Oman e-invoicing (Oman Tax Authority's programme, reportedly called "Fawtara"; verify): which phase applies to Saqient, from when, and what format, QR code or clearance does it require? | Finance / tax advisor | Invoice PDF and data fields (slice 8); go-live if already mandatory |
| OQ-02 | Are bilingual Arabic + English tax invoices mandatory for us, or only preferred? | Finance / tax advisor | Invoice PDF template |
| OQ-03 | Oman PDPL: must customer personal data stay in Oman, or is a GCC region (Bahrain/UAE) acceptable? | Legal | Hosting choice (TRD) |
| OQ-04 | VAT treatment of the header Adjustment (MVP: no VAT on the Adjustment). Confirm with the accountant | Accountant | US-10 |
| OQ-05 | Do cancelled invoices need a VAT credit note instead of (or as well as) the "Cancelled" status? | Accountant | US-12 |
| OQ-06 | Invoice number format, and where the sequence starts (continue from Zoho's last number?) | Finance | US-12 |
| OQ-07 | Do historic Quotes, Sales Orders and Invoices need importing from Zoho, or is an archived export enough? | Sales Manager | US-17 scope |
| OQ-08 | The exact business hours behind the 99.5% target (e.g. Sun–Thu 08:00–18:00 Asia/Muscat) | Ops | Monitoring setup |
| OQ-09 | Which SMTP provider and sending domain should we use (with SPF/DKIM configured)? | Ops | US-13 |
| OQ-10 | The final reason for rebuilding (working assumption: sell it later) | Founders | Phase 2 priorities |
| OQ-11 | Which accounting system to sync with in Phase 2 | Finance | Phase 2 |
