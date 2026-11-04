# Manual testing guide

A plain-language guide to what the CRM does today, what it does not do yet, and how to try every working part in your browser on a Windows PC.

Checked against `main` at commit 62faa9f on 2026-11-04. The app was started from scratch, signed into as each seeded user and clicked through, and the browser test suite was run: 39 of 40 tests that could run passed (the one failure is a keyboard-focus check on the "Skip to content" link, not a sales feature). The tests for email, WhatsApp, PDFs and import were skipped because they need the extra setup in [Part 4](#part-4-optional-pdfs-email-whatsapp-and-zoho-import).

---

## Part 1: Is this a real CRM?

**Yes, for the core sales cycle.** You can capture a lead, convert it into a customer (account + contact) and a deal, move the deal through a pipeline, build a quote with VAT, turn it into a sales order and then a tax invoice, and mark the invoice paid. Every change is recorded on the record's timeline. Each user only sees what they should: reps see their own deals and leads, managers see their team's, admins see everything, and two companies on the same system never see each other's data.

### Does it remind me to follow up a lead?

**No, not yet.** There are no notifications of any kind today: no bell icon, no pop-ups, no emails, and no phone alerts. This was a deliberate cut: the requirements (`docs/PRD.md`, US-15) say *"Email and push reminders for activities are Phase 2. The MVP shows overdue items in-app only."*

What you do get:

- **Tasks with due dates.** You can create a task such as "Call Salim back" with a due date.
- **An overdue count.** When you open the app, the Home page ("My day") and the **My Activities** page show what is due today and what is overdue, with a red "Overdue" badge.
- **A calendar** on My Activities (month and week views) and an agenda list.

So the app only reminds you **if you open it and look**. It will not tap you on the shoulder.

There is one more gap that matters for lead follow-up: **a task cannot be attached to a lead from the screen yet.** The "Log activity" button only appears on accounts and contacts. A task made from My Activities is not linked to any record. (The system underneath supports linking tasks to leads and deals; the button just hasn't been added to those pages.)

### What works today (verified)

| Area | What you can do |
|---|---|
| Sign-in and users | Sign in, sign out, wrong-password and deactivated-user messages. Admin invites users, sets their role (admin, manager, rep) and manager, deactivates them, and can hand their open records to someone else. |
| Leads | Create, edit, list, search. **Convert** a lead into an account + contact (or attach it to existing ones) and optionally a deal. Converted leads move to a "Converted leads" view and can no longer be edited. |
| Accounts and contacts | Create, edit, list (table or grid), view the related contacts, deals and quotes. Phone numbers are normalised. |
| Activities | Log a task, call or meeting from an account or contact. See open, due-today and overdue tasks on My Activities, with a calendar. Mark a task complete. |
| Deals and pipeline | Create deals, drag them across a Kanban board, change stage from the deal page, see stage history. Closing as lost asks for a reason. Deals can be in OMR, AED or INR. |
| Home dashboard | Open pipeline value, win rate, pipeline by stage chart, deals closing soon, today's tasks, recent leads and accounts. |
| Products and VAT | Admin creates products with a VAT category (standard 5%, zero-rated, exempt). Reps see them read-only. Admin manages VAT rates and exchange rates. |
| Quotes | Build a quote with line items, discounts and an adjustment. Totals and VAT are worked out by the server, to 3 decimals (baisa). Start a quote from a deal. |
| Sales orders and invoices | Convert a quote to a sales order, approve it, mark it delivered or cancel it. Create an invoice from it, issue it (it gets a number and is locked), mark it paid, or cancel it with a reason. |
| Privacy between users | Rep B cannot see Rep A's leads or deals. Everyone in the company can see accounts and contacts. The Demo company sees none of Saqient's data. |

### What works but needs extra setup

These are built and have tests, but need a file store, a background "worker" program and a Chrome browser path before they do anything. See [Part 4](#part-4-optional-pdfs-email-whatsapp-and-zoho-import).

- Invoice and quote **PDFs**.
- **Email** a quote or invoice to a contact (in testing, emails are caught by a local inbox called Mailpit, nothing is really sent).
- **Send on WhatsApp**: opens WhatsApp with a message and a private link to the PDF; the link expires after 7 days and can be revoked.
- **Import from Zoho** (CSV files of leads, accounts, contacts, deals and products), with a dry run first.

### What a full CRM usually has that this one does not (yet)

The first group matters most for day-to-day selling.

1. **Follow-up reminders and notifications** (bell icon, email or phone reminders when a task is due). Planned for Phase 2.
2. **Logging a task or call on a lead or a deal from its page.** Today only accounts and contacts have the button.
3. **Adding notes from the screen.** Notes can be stored and shown on the timeline, but there is no "Add note" box yet.
4. **Leads, Quotes, Sales Orders and Invoices in the top menu.** The tabs show Home, Accounts, Contacts, Deals, Products and My Activities only. You reach Leads from "View all" on the Home page, and the others from the deal or quote they belong to, or by typing the address (for example `http://localhost:3100/app/Invoices`).
5. **Email inbox sync** (Gmail or Outlook) and **calendar sync**. Phase 2.
6. **Automation**: workflow rules, automatic lead assignment, "when a deal reaches stage X, create a task". Phase 2.
7. **Two-way WhatsApp chat** (today it only shares a link). Phase 2.
8. **Sales forecasts and targets** per rep. Moved to Phase 2.
9. **Reports you can build yourself** and export. Only the Home dashboard exists.
10. **Custom fields and layouts from settings**, more than one pipeline, editing stages. Phase 2.
11. **Payments**: recording part payments, credit notes, accounting sync. Today an invoice is simply marked paid or cancelled.
12. **Marketing**: campaigns, email templates, web-to-lead forms.
13. **Mobile app**. The website works on a phone screen, but there is no app.
14. **Arabic** screens and bilingual invoices, and e-invoicing submission. Waiting on open questions.
15. **Going live**: it has not been put on a real server yet. The backup restore drill and a real Zoho import check are still to do (`docs/PLAN.md`, go-live gate).

---

## Part 2: Set it up on your Windows PC (one time)

You need three programs. Install each one, then restart the PC once.

1. **Docker Desktop**: <https://www.docker.com/products/docker-desktop/>. Open it and wait until it says "Engine running".
2. **Node.js 24 LTS**: <https://nodejs.org/>. Take the default options.
3. **Git**: <https://git-scm.com/download/win>, if you don't already have it.

Then open **PowerShell** (Start menu → type "PowerShell") and run these one at a time.

```powershell
# 1. Turn on pnpm, the package tool this project uses (comes with Node)
corepack enable

# 2. Get the code (skip if you already have the folder)
git clone https://github.com/muhdsahal99/crm.git
cd crm

# 3. Install the project's libraries (a few minutes the first time)
pnpm install

# 4. Make your private settings file from the example
Copy-Item .env.example .env.local
notepad .env.local
```

In Notepad, replace every `<...>` placeholder with your own value and save. Simple values are fine for testing on your own PC. For example:

| Setting | Example value |
|---|---|
| `POSTGRES_PASSWORD` | `pgpass1` |
| `CRM_OWNER_PASSWORD` and the `<crm-owner-password>` in the URLs | `ownerpass1` |
| `CRM_APP_PASSWORD` and the `<crm-app-password>` in the URLs | `apppass1` |
| `CRM_AUTH_PASSWORD` and the `<crm-auth-password>` in the URLs | `authpass1` |
| `BETTER_AUTH_SECRET` | any 32 or more letters and numbers, for example `my-local-secret-0123456789abcdefghij` |
| `SEED_PASSWORD` | the password you will type to sign in, for example `TestPass123!` |

The same password must appear in both places: if `CRM_APP_PASSWORD=apppass1`, then `DATABASE_URL` becomes `postgres://crm_app:apppass1@localhost:5433/crm`. Leave `POSTGRES_PORT=5433` and `BETTER_AUTH_URL=http://localhost:3100` as they are.

Back in PowerShell:

```powershell
# 5. Start the database, Redis and the test mail inbox (Docker must be running)
pnpm infra:up

# 6. Create the tables
pnpm db:migrate

# 7. Add the test companies, users and sample data
pnpm db:seed
```

You should see `migrations applied` and then `seeded and provisioned 2 orgs`.

> Use `pnpm infra:up`, not plain `docker compose up -d`: it tells Docker to read your `.env.local`. If you change the passwords after the first start, run `docker compose --env-file .env.local down -v` (this deletes the local test data) and start again from step 5.

## Part 3: Test it in the browser

### Start the app (every time)

```powershell
cd crm
pnpm infra:up        # only if you restarted the PC or Docker
pnpm dev -p 3100
```

Wait until it says `Ready`, then open **<http://localhost:3100>** in Chrome or Edge. Keep the PowerShell window open while you test; press `Ctrl+C` in it to stop the app.

The first time you open each page it can take 10 to 30 seconds to appear, because the app is being prepared in the background. After that it is fast.

### Test logins

Every user has the password you put in `SEED_PASSWORD`.

| Email | Company | Role | Use it to test |
|---|---|---|---|
| `admin@saqient.test` | Saqient | Admin | Settings, users, products, VAT, invoices |
| `manager@saqient.test` | Saqient | Manager | Sees Rep A's and Rep B's work |
| `rep.a@saqient.test` | Saqient | Rep | The main sales flows (has sample data) |
| `rep.b@saqient.test` | Saqient | Rep | Privacy: must not see Rep A's deals and leads |
| `deactivated@saqient.test` | Saqient | Rep, deactivated | Must be refused at sign-in |
| `admin@demo.test` | Demo | Admin | A second company: must see none of Saqient's data |
| `rep@demo.test` | Demo | Rep | Same |

Rep A starts with: two accounts (Al Noor Trading LLC, Gulf Horizon Logistics), a contact (Ahmed Al Balushi), a lead (Salim Al Rawahi), a deal (Al Noor fit-out, OMR 10,000), a quote, a sales order, an invoice, and an overdue task "Follow up with Al Noor".

Tick each check as you go. If something doesn't match, note the step number and what you saw.

### Test 1: Signing in

1. Open <http://localhost:3100>. You see the landing page. Click **Sign in**.
2. Type `rep.a@saqient.test` and a **wrong** password. Click **Sign in**.
   - [ ] An error appears under the form and you stay on the sign-in page.
3. Sign in with `deactivated@saqient.test` and the right password.
   - [ ] A message says the account is deactivated.
4. Sign in with `rep.a@saqient.test` and the right password.
   - [ ] You land on the Home page showing "Sales Overview".
5. Click your initials or name at the top right and choose **Sign out**.
   - [ ] You are back on the sign-in page. Opening <http://localhost:3100/app> sends you to sign-in again.

### Test 2: Home dashboard (as Rep A)

1. Sign in as `rep.a@saqient.test`.
   - [ ] "Open pipeline" shows OMR 10,000.000.
   - [ ] "Pipeline by stage" shows a bar for Qualification.
   - [ ] "Closing soon" lists Al Noor fit-out.
   - [ ] "My day" shows "Follow up with Al Noor" with an **Overdue** badge.
   - [ ] "Recent leads" shows Salim Al Rawahi; "Recent accounts" shows the two accounts.

### Test 3: Leads

1. On Home, under **Recent leads**, click **View all** (or go to <http://localhost:3100/app/Leads>).
2. Click **New**. Fill in First Name `Fatma`, Last Name `Al Hinai`, Company `Hinai Interiors`, Email `fatma@example.com`, Mobile `9234 5678`, Lead Source any value. Click **Save**.
   - [ ] You land on the new lead's page with your details. The **Timeline** at the bottom says "Created by Rep A".
3. Click **Edit**, change Lead Status to `Contacted`, save.
   - [ ] The timeline shows the change.
4. Go back to the Leads list.
   - [ ] Fatma Al Hinai is listed. Try the **Table** and **Grid** buttons.

### Test 4: Convert a lead into a customer and a deal

1. Open the lead **Fatma Al Hinai** and click **Convert**.
2. In the dialog, keep "Create new account: Hinai Interiors" and "Create new contact". Tick **Also create a deal**, keep the deal name, pick a closing date, a stage (for example Qualification) and type an amount, for example `5000`.
3. Click **Convert lead**.
   - [ ] You land on the new contact's page.
   - [ ] Go to **Accounts**: Hinai Interiors is there. Go to **Deals**: the new deal is there.
4. Go to <http://localhost:3100/app/Leads> and click **Converted leads**.
   - [ ] Fatma is listed there and no longer in the main list. Opening her shows she cannot be edited.

### Test 5: Accounts, contacts and logging activities

1. Click **Accounts** in the top menu and open **Al Noor Trading LLC**.
   - [ ] You see its details, and related lists for contacts and deals (Ahmed Al Balushi, Al Noor fit-out).
2. Click **Log activity** (or the button to add a task, call or meeting). Choose **Call**, Subject `Discussed fit-out timeline`, keep the time, Duration `10`, and save.
   - [ ] The call appears at the top of the timeline.
3. Add a **Task**: Subject `Send revised drawings`, Due Date **tomorrow**, Priority `High`. Save.
4. Click **Contacts**, open **Ahmed Al Balushi**, and log a **Meeting** the same way.
   - [ ] It appears on his timeline.

### Test 6: My Activities and overdue follow-ups

1. Click **My Activities** in the top menu.
   - [ ] The counters show open tasks, due today and overdue.
   - [ ] "Follow up with Al Noor" is shown as overdue, with the word "Overdue" (not only a colour).
   - [ ] "Send revised drawings" appears on tomorrow in the calendar. Try **Month** and **Week**.
2. Click **New task**, Subject `Call Hinai Interiors`, Due Date **yesterday**, Status `Not Started`, save.
   - [ ] It shows as overdue on My Activities and on Home.
3. Click **Complete** on "Follow up with Al Noor".
   - [ ] It leaves the overdue list and the overdue count goes down.

Remember: nothing pops up or emails you when a task is due. This page is the reminder.

### Test 7: Deals and the pipeline board

1. Click **Deals**, then **Pipeline board**.
   - [ ] You see columns for each stage with deal cards and a total per column.
2. Drag **Al Noor fit-out** from Qualification to **Needs Analysis**.
   - [ ] The card stays in the new column after you reload the page.
3. Open the deal. Under **Stage**, click **Change stage** and choose `Proposal/Price Quote`.
   - [ ] Probability and Expected Revenue update, and the timeline shows "Stage changed".
4. On the board, drag the Hinai deal to the **Drop here to close as lost** area (or choose `Closed Lost` on its page).
   - [ ] A box asks "Why was this deal lost?". Without a reason it won't close. Give a reason and confirm.
5. Click **New** on the Deals page and create a deal in **AED** with an amount.
   - [ ] It saves and shows an exchange rate to OMR.

### Test 8: Products, VAT and exchange rates (as Admin)

1. Sign out, sign in as `admin@saqient.test`. You now also see the settings icon in the bottom dock.
2. Click **Products** → **New**. Name `Site survey`, Code `SURVEY`, VAT Category `Zero-rated`, Unit Price `40.000`. Save.
   - [ ] The product is listed.
3. Open settings → **VAT rates**.
   - [ ] Standard 5%, zero-rated and exempt are listed.
4. Open **Exchange rates**.
   - [ ] AED and INR rates to OMR are listed, and you can add a new rate.
5. Open **Organisation** → **Seller** tab. Fill in **Legal name** (for example `Saqient LLC`) and **VAT number (seller)** (for example `OM1234567890`). Click **Save settings**.
   - [ ] It saves. (Invoices can't be issued without these; Test 10 needs it.)
6. Sign out, sign in as `rep.a@saqient.test`, open **Products**.
   - [ ] Rep A sees Site survey but cannot edit it.

### Test 9: Build a quote

1. As Rep A, open the deal **Al Noor fit-out** and click **New quote**.
2. Add lines: `Consulting day` × 2, and `Site survey` × 1. Try a discount on one line. Save.
   - [ ] The totals are calculated for you: Sub Total, Total VAT (5% on the consulting days, 0 on the zero-rated survey) and Grand Total, all to 3 decimals.
3. Click **Edit**, add an **Adjustment** of `-0.190` or similar, save.
   - [ ] The Grand Total changes by exactly that amount.
   - [ ] The quote got a number like `QT-000002`, and the deal page lists it under **Related → Quotes**.

### Test 10: Sales order and invoice

1. On the quote, click **Convert to sales order**.
   - [ ] You land on a new sales order with the same lines and totals.
2. Click **Approve**, then **Mark delivered**.
   - [ ] The status changes each time and the timeline records it.
3. Click **Create invoice**.
   - [ ] You land on a draft invoice.
4. Click **Issue invoice**.
   - [ ] It gets an invoice number and can no longer be edited. (If it says to set the legal name and VAT number, do Test 8 step 5 first.)
5. Click **Mark paid**.
   - [ ] Status becomes Paid, and the timeline shows it.
6. Make a second quote (Test 9), take it through steps 1 to 4 to an issued invoice, then click **Cancel invoice** and give a reason.
   - [ ] It is marked cancelled but keeps its number.

Lists of all documents: <http://localhost:3100/app/Quotes>, <http://localhost:3100/app/Sales_Orders>, <http://localhost:3100/app/Invoices>.

### Test 11: Who can see what

1. Sign in as `rep.b@saqient.test`.
   - [ ] **Deals** shows none of Rep A's deals; the Leads list (<http://localhost:3100/app/Leads>) shows none of Rep A's leads.
   - [ ] **Accounts** does show Al Noor Trading LLC (accounts are shared inside the company).
2. Sign in as `manager@saqient.test`.
   - [ ] Deals shows Rep A's deals (the manager sees the team).
3. Sign in as `admin@demo.test`.
   - [ ] Accounts shows only "Demo Customer". Nothing from Saqient appears anywhere.

### Test 12: Managing users (as Admin)

1. Sign in as `admin@saqient.test` and open settings → **Users**.
   - [ ] All Saqient users are listed with role, manager and status.
2. Click **Invite user**, enter a name and an email like `new.rep@example.com`, role Rep, and send.
   - [ ] A link is shown to copy (email delivery needs Part 4). Open the link in a **private/incognito window**, set a name and password.
   - [ ] The new person lands signed in. Opening the same link again no longer works.
3. Open **Rep B**, change their manager, save.
4. Open the invited user and choose **Deactivate**. In the dialog, pick someone to transfer their open records to, and confirm.
   - [ ] Their status becomes Deactivated and they can no longer sign in.
5. Sign in as `rep.a@saqient.test` and open <http://localhost:3100/app/settings/users>.
   - [ ] A rep gets a "not found" page.

### Test 13: Phone screen

1. In Chrome or Edge, press `F12`, then click the phone/tablet icon at the top of the panel, and choose a phone such as "iPhone SE".
2. Repeat Tests 4, 7 and 9 quickly.
   - [ ] Everything is reachable, the menu moves to the bottom dock, and you never need to scroll sideways.

---

## Part 4 (optional): PDFs, email, WhatsApp and Zoho import

These need three more things running, so leave them until Tests 1 to 13 pass.

1. **File storage.** Add to `.env.local`:
   ```
   S3_ENDPOINT=http://localhost:9000
   S3_BUCKET=crm-dev
   S3_ACCESS_KEY_ID=minioadmin
   S3_SECRET_ACCESS_KEY=minioadmin123
   ```
   then run `pnpm infra:storage`.
2. **A Chrome path for PDFs.** Add `CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe` (check the path on your PC; Edge also works).
3. **The worker.** In a second PowerShell window: `cd crm` then `pnpm --filter worker start`. Keep it open next to `pnpm dev`.
4. **Email in testing.** Add `ALLOW_PRIVATE_SMTP=true` to `.env.local`. As Admin, in Organisation → **Email**, set the SMTP host to `127.0.0.1`, port `1025` and a sender address. Sent emails appear at <http://localhost:8025> (Mailpit), and nothing leaves your PC.

Restart `pnpm dev -p 3100` after changing `.env.local`. Then:

- [ ] **PDF**: on an issued invoice, **Download PDF** opens the invoice (the first time it may say it is being prepared; try again after a few seconds).
- [ ] **Email**: on a quote with a contact that has an email, **Send email** → the email with the PDF attached appears in Mailpit, and "Email sent" appears on the quote's Emails list and timeline.
- [ ] **WhatsApp**: pick a contact with a mobile number, click **Send on WhatsApp** → WhatsApp Web opens with a message and a link. Open the link in a private window: it shows only that PDF. Click **Revoke**; the link now says it has expired.
- [ ] **Zoho import** (Admin): settings → **Import from Zoho**, upload a CSV of accounts, map the columns, run the dry run, confirm. The rows appear under Accounts, and any failed rows can be downloaded with their errors. Importing the same file again creates no duplicates.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| `pnpm` is not recognised | Run `corepack enable` in a new PowerShell window. If it still fails, reinstall Node.js 24. |
| `pnpm infra:up` says "set POSTGRES_PASSWORD" or Docker errors | Make sure Docker Desktop is open and says "Engine running", and that `.env.local` exists in the `crm` folder. |
| `pnpm db:migrate` says password authentication failed | The passwords in the URLs don't match the `CRM_*_PASSWORD` lines. Fix `.env.local`, then run `docker compose --env-file .env.local down -v` and start again from step 5 of Part 2. |
| Port 5433 or 6379 is already in use | Another database is running. Close it, or change `POSTGRES_PORT` and the `5433` in every URL to another number. |
| The app says the config is invalid when starting | A line in `.env.local` is missing or still has `<...>` in it. The message names the setting. |
| "Too many attempts" at sign-in | After 10 wrong passwords the sign-in pauses for 15 minutes. Wait, or restart Redis with `pnpm infra:down` then `pnpm infra:up`. |
| Sign-in does nothing or loops back | Make sure you started with `pnpm dev -p 3100` and opened `http://localhost:3100` (not 3000). |
| A page is blank for a long time the first time | Wait 30 seconds and reload. The first visit to each page is slow in this test mode. |
