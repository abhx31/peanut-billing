# Peanut Billing – handover spec (version 2)

> **Version 2.** This package replaces the earlier zip. Nothing is removed and no new storage functions are needed, so a working version-1 adapter keeps working. See `CHANGELOG.md` for exactly what is new and what to re-test.

(for implementing in your own stack / Claude Code)

## 1. Files
| File | Purpose |
|---|---|
| `index.html` | Page markup: header, the tab bar, one `<section>` per tab, dialogs, print area. |
| `styles.css` | All screen styles (light/dark by system setting). Print rules are in here too (`@media print`). |
| `app.js` | All behaviour: data loading, calculations, rendering, dialogs, printing. Plain JavaScript, no framework, no build step. |
| `mock-claude.js` | **Dev only.** A localStorage stand-in for the host functions described in section 2, so `index.html` runs by double-clicking it (`?role=staff` shows the staff view). Delete its `<script>` line when your backend provides the real thing. |

The page renders by rebuilding tables with innerHTML and uses inline `onclick="fn('id')"` handlers, so its functions must stay global.

## 2. The one thing you must provide: `window.claude`
`app.js` stores and reads everything through three async providers. Nothing else is needed from the server.

```js
const db = await window.claude.use("db");
db.collection("bills").onSnapshot(snap => { /* snap.docs[i].id, .data() */ }); // fires once at start, then after every change; returns unsubscribe
await db.collection("bills").add({...});           // -> {id}
db.doc("meta/settings").onSnapshot(snap => { /* snap.exists, snap.data() */ });
await db.doc("lots/ID").set({...});                // replace
await db.doc("lots/ID").update({field: v});        // shallow merge; reject with error.code === "not-found" if the doc is missing
await db.doc("lots/ID").delete();
// errors: Error objects with .code, e.g. "permission-denied", "not-found", "unauthenticated"

const u = await window.claude.use("user");
await u.isOwner();   // true for the owner
await u.canEdit();   // true for owner AND editor (a "second owner")
await u.can("data.write"); // false => app shows a view-only banner
// The app shows the OWNER VIEW when isOwner() || canEdit(). Anyone else gets the STAFF VIEW.

const d = await window.claude.use("downloads");
await d.save({filename: "x.csv", data: "text"});   // trigger a browser download
```
Requirements for your adapter:
- Snapshots must reflect your own writes immediately (optimistic update) and other devices' writes within a few seconds (polling every 2–3 s is fine; the Next.js zip's `public/claude-shim.js` is a working reference implementation of this contract against Postgres).
- Collections `private` and `patti` must **never be sent to or accepted from staff**. The page also hides them, but enforce it on the server. Note: `patti` now holds **two kinds** of documents, purchase patti bills and GST purchase bills (`kind:"gstp"`), and both must stay hidden from staff.
- Document ids are opaque strings. Two ids are meaningful dates: `closing/YYYY-MM-DD` and `hpaid/YYYY-MM-DD`.
- Only per-device setting kept in the browser: `localStorage["loc"]` = `""` (Main store) or `"NM"` (New Mahavir) – the "Working at" selector.

## 3. Data model (all money in rupees, dates `YYYY-MM-DD`, `at` = ms timestamp)
| Path | Fields |
|---|---|
| `lots/{id}` | `name, at`. (No cost here.) |
| `private/costs` (owner/editor only) | one doc: `{ "<lotId>": costPerKg, ... }` |
| `stockin/{id}` | `lotId, bags, d, src?, ref?` – stock added to the **main store** (opening stock is also a stock-in). Purchases add rows with `src:"patti"` or `src:"gstp"` and `ref` = the purchase document id, so deleting the purchase can delete its stock rows. Staff can read these rows (bags only, no prices). |
| `xfer/{id}` | `lotId, lot, bags, dir ("out" = Main→New Mahavir, "back" = return), d, note, at` |
| `bills/{id}` (normal) | `loc?("NM"), no, fy, date, cust, items[{lotId,lot,bags,kg,rate,wts,amount}], lot (names joined " + "), bags, kg, rate (avg), ham, g (0), gst (0), amount, total, prev?, paidNow?, at` – `prev` = the customer's balance before this bill and `paidNow` = money received when billing (both printed on the bill; absent on older bills). |
| `bills/{id}` (patti sale) | `kind:"psale"`, otherwise as a normal bill with `ham:0, g:0, gst:0`, `amount` = kg × rate, `total` = net receivable, plus `pt{cdPct,cd,labRate,labor,brRate,broker,transport}`. Uses the normal bill number series. |
| `bills/{id}` (GST invoice) | same, plus `kind:"gst", custId, buyer{name,gstin,address,state,code}, consignee{…}, seller{firm profile snapshot}, hdr{ewb,veh,through,dest,dn,mp,rf,or,bo,bd,dd,dt,lr,td}, items[…+hsn,desc], tax{intra,pct,cgst,sgst,igst,ro}`; `total` already includes round-off |
| `pays/{id}` | `billId, d, m ("Cash"\|"UPI"\|"CJ"), a` – every payment on a bill, including the one made at billing. |
| `opening/{id}` | `cust, amount, date, note, at` – old customer dues from before the app (not sales). An entry with `amount:0, note:"Advance received"` records money received from a customer who owed nothing (negative balance). |
| `opay/{id}` | `openId, cust, loc, d, m, a` – payments received against an old due. |
| `expenses/{id}` | `date, cat, note, amt, mode ("Cash"\|"UPI"), loc?, hm?(true for hamali payments), at` |
| `hpaid/{date}` | `date, amt, mode, expId` – hamali paid for that day (links to its expense). |
| `patti/{id}` (owner/editor only) – purchase patti bill, no `kind` field | `no, fy, date, party, lot, wts, bags, kg, rate, amount, cdPct, cd, labRate, labor, brRate, broker, transport, brSign (1), net, paidMode ("", "Cash", "UPI"), paidDate, at` |
| `patti/{id}` with `kind:"gstp"` (owner/editor only) | **GST purchase bill:** `no` (own series per FY, shown "GP 01"), `fy, date, party, sup{name,gstin,address,state,code}, invNo, invDate, items[{lotId,lot,desc,hsn,bags,kg,rate,amount}], bags, kg, pct, taxable, tax{inter,cgst,sgst,igst,ro}, itcOn, itc, net (= total payable), stock (bool), paidMode, paidDate, at`. `net`, `paidMode`, `paidDate`, `party` deliberately match the purchase patti fields so the ledger treats both the same. |
| `gstcust/{id}` | `name, gstin, state, code, phone, address, at` – customer portfolio, GST invoices only. |
| `closing/{date}` | `date, cash?, bank?` – counted closing balances; become the next day's opening. |
| `cjset/{id}` | `date, amt, mode ("Cash"\|"UPI"), note, at` – CJ handing money to the owner. |
| `meta/settings` | `firm, hamali (₹/bag, default 10), openCash, openBank, gstProfile{name,addr,fssai,gstin,state,code,email,bh,bn,ba,bi,decl}, gstStart{"2026-27": firstInvoiceNo}` |

`GDEF` in `app.js` pre-fills the GST firm profile with the sample "Mahavir Enterprises" details from the owner's invoice (bank fields blank). Replace or empty it for your own deployment.
Older single-lot bills have `lotId, lot, bags, kg, rate, wts` at the top level and no `items`; `itemsOf(b)` normalises both shapes.

## 4. Business rules (all implemented in `app.js`)
- **Financial year** = 1 Apr–31 Mar, label like `2026-27` (`fyOf(date)`). Bill numbers restart each year, separately for normal bills and GST invoices (`nextNo`, `nextG`). Display: zero-padded to 2 digits; GST shown as `GST 37`; bills made at the branch get the suffix ` (New Mahavir)`.
- **Normal bill**: item amount = kg × rate/kg; hamali = total bags × hamali rate (default ₹10, editable per bill); no GST on normal bills; total = goods + hamali. Paid = Cash + UPI + CJ. Balance = total − paid. "Balance / credit" button = no payment now.
  Bag weights are optional: bags and total kg can be typed directly; typing individual weights (`40.5 41 50x40.5`) fills both.
- **Profit** per bill = Σ (item amount − kg × lot cost). Hamali and GST are excluded. Owner/editor only; calculated in the browser from `private/costs`. Profit tab: by period (FY), by lot, by day; "profit after expenses" excludes `hm` expenses.
- **Stock** (never stored): Main = Σ stockin − Σ xfer.out + Σ xfer.back − Σ bags sold where `loc` is empty. New Mahavir = Σ out − Σ back − Σ bags sold where `loc="NM"`. Billing warns when bags exceed the stock of the store the user is "working at".
- **GST invoice**: taxable = Σ goods (+ optional hamali). Seller state code equals buyer state code → CGST = SGST = taxable × pct / 200 (rounded to paise); otherwise IGST = taxable × pct / 100. Total is rounded to the nearest rupee, with a "Round Off" line. HSN default `12023090`, GST rate default 5 %. Amount-in-words uses the Indian system (Lakh/Crore). Print layout copies the owner's Tally-style Tax Invoice (A4).
- **Patti (purchase) bill**, all lines optional except weight/bags/price: amount = kg × rate; CD = amount × cd% (−); labour = bags × ₹/bag (−); brokerage = bags × ₹/bag (**+**); transport (−). `net = amount − cd − labour + brokerage − transport`. Paid by Cash/UPI/not paid; paying counts as a cash/UPI outflow on `paidDate`; patti payments are purchases, not expenses, and never reduce profit.
- **Hamali tab**: lists bills with hamali for a date (bags, ₹/bag, amount). "Record hamali payment" creates an `expenses` doc `{cat:"Hamali", hm:true}` + `hpaid/{date}`. It is *not* automatically a ledger expense.
- **Receivables / balances**: customer balance = old due + Σ bills − Σ payments (bills + `opay`). "Receive" on a customer clears old dues first (oldest), then bills in number order. Customers are matched by name (case/space-insensitive).
- **CJ**: a payment mode for when UPI fails and the customer pays a person called CJ. CJ money is **not** in cash or UPI until `cjset` records CJ handing it over (as Cash or UPI). With-CJ balance = Σ CJ pays − Σ settlements.
- **Daily ledger** (both stores combined, tables split "By store"): Cash closing = opening + cash received + CJ settled as cash − cash expenses − patti paid in cash. UPI closing likewise. Opening = latest saved `closing` before the date + flows after it; if none, `meta.openCash/openBank` + all flows before the date. "Close the day" saves counted cash/bank into `closing/{date}` and shows the difference from the books.
- **Dashboard**: today's sales, receipts (cash/UPI/CJ), credit given, expenses, profit (owner), position (cash/bank/CJ, owed by customers, stock per store, patti unpaid), latest 8 bills.
- **Edit bill** (owner/editor, non-GST only, Daily summary): change lot and price per item; amount/total recalculate, bags/weight/payments unchanged.

- **Previous balance on a new bill**: typing a customer name shows their balance (old due + unpaid bills; near-matching names with dues are suggested). The preview shows *Previous balance* and *Total due after this bill*; the printed bill shows *Paid now, Previous balance, Total balance due* (snapshot stored in `prev`/`paidNow`). If the customer pays **more than the bill total**, the extra clears their earlier balance (old dues first, oldest first, then older bills); only if they owe nothing does the extra stay on this bill.
- **Receipts have a date.** Every "Receive" dialog has a *Date received* field. `receiveFrom(name, amount, mode, date)` clears the customer's dues oldest first (old dues, then bills in date/number order); anything left over is recorded as an advance (`opening` entry with `amount:0`).
- **Balances tab**: lists customers with old due, *Pending bills* (bill numbers with their balances), billed, paid, balance; search by name **or bill number**; **Statement** shows old dues, bills and every receipt with date, applied-to, mode, amount. The Receivables tab also lists receipts against old dues with dates.
- **Daily ledger entries by hand**: "+ Money received" (date, customer, amount, Cash/UPI/CJ) deducts from that customer's receivable via `receiveFrom`, and shows in the ledger on the chosen date ("Old due", "Advance" or a bill number). "+ Expense" adds an expense (date, category, note, amount, Cash/UPI, store).
- **GST purchase bill** (owner/editor): supplier details (state auto-filled from GSTIN), supplier invoice no./date, one or more lots (lot, description, HSN, bags, kg, rate), GST rate. Supplier state code equals the firm's (`GP().code`) → CGST = SGST = taxable × pct / 200, otherwise IGST = taxable × pct / 100; total rounded to the rupee. "Add the bags to my stock" creates `stockin` rows (`src:"gstp"`). *Input tax credit* = the tax when "Tax can be claimed back" is ticked (`itc`), else 0. Payment Cash/UPI/not paid works like purchase patti and appears in the ledger as "Purchases paid". The tab lists a month (by supplier invoice date) with taxable, tax/ITC, total, paid, and a **GST summary** table for that month: output tax (GST sales invoices) − ITC, by CGST/SGST/IGST. Deleting a purchase deletes its `stockin` rows.
- **Sale patti bill** (Patti tab, owner/editor, type "Sale patti"): same patti options as the purchase patti (CD −, labour −, brokerage +, transport −; `net = amount − cd − labour + brokerage − transport`) but it is a **sale**: the lot is chosen from stock, the bags are deducted (it is a `bills` doc with `kind:"psale"`, so stock, balances, ledger and profit work unchanged), the net is the amount the buyer owes, and the buyer can pay Cash/UPI/CJ now or later. Profit = net receivable − kg × lot cost. Shown as `NN (Patti)`; printed on A5; not editable via "Edit bill".
- **Purchase patti → stock**: optional "Add these bags to my stock" chooses a lot and creates a `stockin` row (`src:"patti"`); deleting the patti bill removes it.
- Ledger/dashboard wording: payments of purchase patti **and** GST purchases are shown as "Purchases paid (cash/UPI)" and "Purchases not yet paid".

## 5. Roles
| | owner | editor | staff |
|---|---|---|---|
| Profit, cost, Profit tab, Patti tab (purchase and sale patti), GST purchase tab | ✔ | ✔ | ✘ (data blocked server-side) |
| Add/edit old dues, set opening balances, close the day, record CJ/hamali settlements, edit bill, delete transfers, GST firm details | ✔ | ✔ | ✘ (UI only – add server checks if you need them enforced) |
| Billing, GST invoices, stock, expenses, balances, receive payments, ledger (without profit) | ✔ | ✔ | ✔ |

## 6. Screens (tab order)
Dashboard · New bill · Add lots · Daily summary · Stock · New Mahavir · Daily ledger · Expenses · Hamali · CJ · Receivables · Balances · GST bill · GST customers · GST purchase · Patti bill · Profit.
A "Working at: Main store / New Mahavir" bar sits above the tabs; bills, expenses and receipts take the selected store.

## 7. UI behaviour to keep
- **No browser alert/confirm/prompt.** The page can run where those are blocked. Use the in-app `dlg()` / `yn()` dialogs and the `say()` toast.
- **Printing** (`doPrint(html, size)`): normal bills and patti = A5, GST invoices and the ledger = A4, via an injected `@page` rule (`<style id="pgsz">`). If `window.print` is blocked, a message tells the user to open **View → Save as file** and print that file.
- Number inputs have no spinner arrows or wheel changes.
- Everything is mobile-first; tables scroll horizontally inside `.tw` wrappers.

## 8. Suggested ways to port
**A. Fastest (recommended first):** serve `index.html`, `styles.css`, `app.js` from your app (for example under an authenticated route or `public/`), delete the `mock-claude.js` line, and implement `window.claude` with a small script that calls your API (copy the approach in the Next.js zip's `public/claude-shim.js` + `src/app/api/db/route.js`). No page changes needed.
**B. Rewrite as components:** use sections 3–5 as the contract; convert `app.js` function-by-function. If you move to relational tables, keep the derived values derived (stock, balances, profit) rather than storing them.
**Server-side improvements worth doing in either case:** assign bill/invoice/patti numbers inside a database transaction; enforce the owner-only actions in section 5; add an audit trail (who created/edited/deleted a bill); soft-delete instead of hard delete.

## 9. Acceptance checks
1. Make a two-lot bill with cash + UPI + CJ part-payments; balance, stock and profit update.
2. Move 30 bags to New Mahavir; switch "Working at" to New Mahavir; sell from it; the bill shows `(New Mahavir)` and main stock is unchanged.
3. Make a GST invoice for a same-state and an other-state customer: CGST+SGST vs IGST, round-off, amount in words.
4. Enter a patti bill with only bags + total weight; with CD, labour, brokerage, transport the net matches section 4.
5. Hamali tab: two bills' hamali add up for the date; recording payment adds an expense and does not change profit.
6. Record CJ receipts, then a settlement: CJ balance falls, cash/UPI closing rises.
7. Add an old due, then receive a payment that exceeds it: due clears first, remainder goes to bills.
8. Staff login: no Profit/Patti tabs, no cost fields, and the server returns nothing from `private`/`patti`.
9. Print a normal bill (A5) and a GST invoice (A4).
10. A customer with an old due and an unpaid bill: type their name on a new bill – previous balance is shown; pay more than the bill total – the extra clears the old due first, then the older bill; the printed bill shows previous balance and total balance due.
11. Ledger → "+ Money received" dated yesterday for a customer with dues: it appears in yesterday's ledger and the customer's balance falls. Enter more than they owe: the app asks, then records the extra as an advance.
12. Balances: customers who only have an old due are listed; search finds a customer by bill number; Statement shows dated receipts.
13. GST purchase: same-state supplier → CGST+SGST, other state → IGST; stock rises per lot; paying in cash lowers ledger cash; the month's ITC and the GST summary update; deleting the purchase removes the stock again. Staff cannot see the tab or the data.
14. Sale patti: choose a lot, sell 12 bags with CD and brokerage – net is correct, stock drops by 12, the buyer owes the net; profit uses the net.
15. Purchase patti with "Add these bags to my stock": stock rises; deleting the bill lowers it again.
