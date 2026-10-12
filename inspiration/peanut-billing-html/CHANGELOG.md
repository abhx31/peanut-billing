# Changelog – version 2 (since the zip you already have)

No new storage functions are needed: `window.claude.use("db" | "user" | "downloads")` is unchanged. No new top-level collections. Existing data stays valid.

## Fixes to the money-received / receivables flow
- **New bill for a customer who owes money:** the form now shows their earlier balance (old due + unpaid bills), suggests similar names with dues, adds *Previous balance* and *Total due after this bill* to the preview, and prints them on the bill. Paying more than the bill clears the earlier balance first (old dues, then older bills).
- **Dates on receipts:** all Receive dialogs now ask for the date received; Receivables has a dated list of money received against old dues; Balances has a per-customer **Statement** (old dues, bills, dated receipts).
- **Daily ledger:** new buttons **+ Money received** (deducts from the customer's receivable on the chosen date) and **+ Expense**. Money received now shows on the right day.
- **Balances tab:** new *Pending bills* column (bill numbers + balances); search by customer name or bill number; customers who only have an old due are included.
- Money received beyond what a customer owes is kept as an **advance** (`opening` doc with `amount:0`, note "Advance received").

## New features
- **GST purchase bill** (tab "GST purchase", owner/editor): supplier with GSTIN, CGST/SGST or IGST, adds bags to stock, records **input tax credit**, monthly list and a GST summary (tax on sales vs tax to claim back), print/view on A5. Stored in the restricted `patti` collection with `kind:"gstp"`.
- **Sale patti bill** (Patti tab → type "Sale patti"): patti options (CD, labour, brokerage, transport) on a **sale** that deducts stock; stored as a normal `bills` doc with `kind:"psale"` and `pt{...}`, shown as "NN (Patti)".
- **Purchase patti:** optional "Add these bags to my stock" (creates `stockin` rows with `src:"patti"`, removed again if the patti bill is deleted).

## Small changes
- `dlg()` dialogs can now contain date fields, pick-lists (datalist) and a preselected option.
- Ledger/dashboard text: "Patti paid / not yet paid" became "Purchases paid / not yet paid" because GST purchases share the same payment fields (`net`, `paidMode`, `paidDate`, `party`).
- Normal bills now store `prev` and `paidNow`.
- `stockin` docs may carry `src` and `ref`.

## Server checks for the developer
1. `patti` now contains GST purchase documents too – keep the whole collection hidden from staff.
2. Stock is derived: Σ `stockin` − transfers − bags sold; GST purchases and purchase patti add `stockin` rows that staff may read (bags only).
3. Re-run the acceptance checks in SPEC.md section 9 (items 10–15 are new).

## Re-test first
Receive a payment on a credit customer with a back date and confirm it appears on that date's ledger; make a new bill for a customer with an old due; make a GST purchase and a sale patti and check stock, ledger and balances.
