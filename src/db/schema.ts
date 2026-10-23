import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  date,
  uuid,
  primaryKey,
  uniqueIndex,
  pgEnum,
  jsonb,
  boolean,
  customType,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

export const roleEnum = pgEnum("user_role", ["owner", "editor", "staff"]);
export const paymentModeEnum = pgEnum("payment_mode", ["Cash", "UPI", "CJ"]);
export const billKindEnum = pgEnum("bill_kind", ["normal", "gst", "psale"]);
export const xferDirEnum = pgEnum("xfer_dir", ["out", "back"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  passwordHash: text("password_hash"),
  image: text("image"),
  role: roleEnum("role").notNull().default("staff"),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const lots = pgTable("lots", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const lotCosts = pgTable("lot_costs", {
  lotId: uuid("lot_id")
    .primaryKey()
    .references(() => lots.id, { onDelete: "cascade" }),
  costPerKg: numeric("cost_per_kg", { precision: 14, scale: 4 }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const stockIn = pgTable("stock_in", {
  id: uuid("id").defaultRandom().primaryKey(),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => lots.id, { onDelete: "cascade" }),
  bags: integer("bags").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  loc: text("loc"), // null = Main store, "NM" = New Mahavir
  // Where the stock came from. null = opening/manual add, "patti" = purchase
  // patti with Add-to-stock, "gstp" = GST purchase. `ref` points at that
  // source doc (patti_bills.id) so deleting the source removes these rows.
  src: text("src"),
  ref: uuid("ref"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Stock transfers between Main store and New Mahavir branch.
export const transfers = pgTable("transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => lots.id, { onDelete: "restrict" }),
  lotNameSnapshot: text("lot_name_snapshot").notNull(),
  bags: integer("bags").notNull(),
  dir: xferDirEnum("dir").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: billKindEnum("kind").notNull().default("normal"),
    no: integer("no").notNull(),
    fy: text("fy").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    customer: text("customer").notNull(),
    // Optional contact number collected on the New Bill form. Never required.
    customerPhone: text("customer_phone"),
    loc: text("loc"), // null = Main store, "NM" = New Mahavir
    hamaliPerBag: numeric("hamali_per_bag", { precision: 14, scale: 2 }).notNull(),
    hamali: numeric("hamali", { precision: 14, scale: 2 }).notNull(),
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    gst: numeric("gst", { precision: 14, scale: 2 }).notNull().default("0"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    // GST invoice fields (null for normal bills).
    gstCustomerId: uuid("gst_customer_id"),
    buyerSnapshot: jsonb("buyer_snapshot"),
    consigneeSnapshot: jsonb("consignee_snapshot"),
    sellerSnapshot: jsonb("seller_snapshot"),
    headerExtras: jsonb("header_extras"), // ewb, veh, through, dest, dn, mp, rf, or, bo, bd, dd, dt, lr, td
    taxBreakdown: jsonb("tax_breakdown"), // { intra, pct, cgst, sgst, igst, ro }
    // Snapshot of what the customer owed before this bill (prev) and what was
    // collected at the time of billing (paidNow). Printed on the bill.
    prev: numeric("prev", { precision: 14, scale: 2 }),
    paidNow: numeric("paid_now", { precision: 14, scale: 2 }),
    // Sale-patti adjustments. Populated only when kind = "psale".
    patti: jsonb("patti"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bills_kind_loc_fy_no_uq").on(
      t.kind,
      sql`coalesce(${t.loc}, 'MS')`,
      t.fy,
      t.no,
    ),
  ],
);

export const billItems = pgTable("bill_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  billId: uuid("bill_id")
    .notNull()
    .references(() => bills.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => lots.id, { onDelete: "restrict" }),
  lotNameSnapshot: text("lot_name_snapshot").notNull(),
  weightsText: text("weights_text"),
  bags: integer("bags").notNull(),
  kg: numeric("kg", { precision: 14, scale: 3 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  // GST-only
  hsn: text("hsn"),
  description: text("description"),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  billId: uuid("bill_id")
    .notNull()
    .references(() => bills.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  mode: paymentModeEnum("mode").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  // Optional free-text note entered on the Receive dialog (e.g. "part payment
  // via driver"). Shown alongside the entry in the Daily ledger.
  note: text("note"),
  // Every row inserted by one Receive click shares this id, so statements can
  // show the customer's actual payment amount instead of its per-bill split.
  receiptGroupId: uuid("receipt_group_id"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  category: text("category").notNull(),
  note: text("note"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  mode: paymentModeEnum("mode").notNull(),
  loc: text("loc"),
  isHamali: boolean("is_hamali").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Old customer dues from before the firm started using the app.
export const openingDues = pgTable("opening_dues", {
  id: uuid("id").defaultRandom().primaryKey(),
  customer: text("customer").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const openingPayments = pgTable("opening_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  openingDueId: uuid("opening_due_id")
    .notNull()
    .references(() => openingDues.id, { onDelete: "cascade" }),
  customer: text("customer").notNull(),
  loc: text("loc"),
  date: date("date", { mode: "string" }).notNull(),
  mode: paymentModeEnum("mode").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  // Optional free-text note entered on the Receive dialog.
  note: text("note"),
  // Every row inserted by one Receive click shares this id.
  receiptGroupId: uuid("receipt_group_id"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// GST customers portfolio (used only on GST invoices).
export const gstCustomers = pgTable("gst_customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  gstin: text("gstin"),
  state: text("state"),
  stateCode: text("state_code"),
  phone: text("phone"),
  address: text("address"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Counted closing balances per day. closing.date is the business day; becomes next day's opening.
export const closings = pgTable("closings", {
  date: date("date", { mode: "string" }).primaryKey(),
  cash: numeric("cash", { precision: 14, scale: 2 }),
  bank: numeric("bank", { precision: 14, scale: 2 }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// CJ (go-between) handing collected money back to the owner as Cash/UPI.
export const cjSettlements = pgTable("cj_settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  mode: paymentModeEnum("mode").notNull(), // Cash or UPI only in practice
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Cash deposited into the bank: reduces Cash in hand, increases Bank/UPI, on
// the given date. Deletable and editable like any other Daily ledger entry.
export const cashDeposits = pgTable("cash_deposits", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Hamali paid-out record per day (one per date). References the expense entry it created.
export const hamaliPaid = pgTable("hamali_paid", {
  date: date("date", { mode: "string" }).primaryKey(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  mode: paymentModeEnum("mode").notNull(),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Patti (purchase) bills. Also holds GST purchase bills — distinguished by
// the `kind` column: null = regular purchase patti, "gstp" = GST purchase.
export const pattiBills = pgTable(
  "patti_bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // null = regular purchase patti, "gstp" = GST purchase bill.
    kind: text("kind"),
    no: integer("no").notNull(),
    fy: text("fy").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    party: text("party").notNull(),
    lotName: text("lot_name"),
    weightsText: text("weights_text"),
    bags: integer("bags").notNull(),
    kg: numeric("kg", { precision: 14, scale: 3 }).notNull(),
    rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    cdPct: numeric("cd_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    cd: numeric("cd", { precision: 14, scale: 2 }).notNull().default("0"),
    labRate: numeric("lab_rate", { precision: 14, scale: 2 }).notNull().default("0"),
    labor: numeric("labor", { precision: 14, scale: 2 }).notNull().default("0"),
    brRate: numeric("br_rate", { precision: 14, scale: 2 }).notNull().default("0"),
    broker: numeric("broker", { precision: 14, scale: 2 }).notNull().default("0"),
    brSign: integer("br_sign").notNull().default(1), // 1 adds brokerage, -1 deducts
    transport: numeric("transport", { precision: 14, scale: 2 }).notNull().default("0"),
    net: numeric("net", { precision: 14, scale: 2 }).notNull(),
    paidMode: text("paid_mode"), // null = not paid, "Cash" or "UPI" when paid
    paidDate: date("paid_date", { mode: "string" }),
    // GST-purchase-only fields (null on regular purchase patti).
    supplier: jsonb("supplier"),
    invNo: text("inv_no"),
    invDate: date("inv_date", { mode: "string" }),
    items: jsonb("items"),
    pct: numeric("pct", { precision: 5, scale: 2 }),
    taxable: numeric("taxable", { precision: 14, scale: 2 }),
    tax: jsonb("tax"), // { inter, cgst, sgst, igst, ro }
    itcOn: boolean("itc_on"),
    itc: numeric("itc", { precision: 14, scale: 2 }),
    // "Add bags to stock" flag used by both purchase patti and GST purchase.
    stock: boolean("stock"),
    stockLotId: uuid("stock_lot_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("patti_kind_fy_no_uq").on(
      sql`coalesce(${t.kind}, '')`,
      t.fy,
      t.no,
    ),
  ],
);

// Partial-payment ledger for purchases (regular Patti + GST Purchase — both
// rows in pattiBills). Mirrors `payments` on the sales side: a purchase bill
// is paid across however many days/modes it actually takes, instead of one
// all-or-nothing paidMode/paidDate flag. pattiBills.paidMode/paidDate stay as
// a cached "fully settled" snapshot (latest payment's mode/date, or null),
// recomputed whenever a row here is added or removed.
export const pattiPayments = pgTable("patti_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  pattiId: uuid("patti_id")
    .notNull()
    .references(() => pattiBills.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  mode: paymentModeEnum("mode").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  firm: text("firm").notNull().default("Peanut Traders"),
  hamaliDefault: numeric("hamali_default", { precision: 14, scale: 2 }).notNull().default("10"),
  openingCash: numeric("opening_cash", { precision: 14, scale: 2 }).notNull().default("0"),
  openingBank: numeric("opening_bank", { precision: 14, scale: 2 }).notNull().default("0"),
  // CJ money carried forward from closed financial years.
  cjOpening: numeric("cj_opening", { precision: 14, scale: 2 }).notNull().default("0"),
  // GST firm profile: { name, addr, fssai, gstin, state, code, email, bh, bn, ba, bi, decl }
  gstProfile: jsonb("gst_profile"),
  // Map of fy → first GST invoice number (if the firm started mid-FY with paper invoices).
  gstStart: jsonb("gst_start"),
  // Firm letterhead image as a base64 data URL (e.g. "data:image/jpeg;base64,…").
  // Shown as the top banner on every printed bill / patti / hamali / ledger.
  letterheadImage: text("letterhead_image"),
  extras: jsonb("extras"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// One row per archived financial year: gzipped JSON of every row the close removes, plus the
// still-owed rows of that year as they stood at close time. "pending" = archived and waiting for
// the owner's check (nothing removed yet); "closed" = checked and its rows removed.
export const fyArchives = pgTable("fy_archives", {
  fy: text("fy").primaryKey(),
  status: text("status").$type<"pending" | "closed">().notNull().default("closed"),
  counts: jsonb("counts").notNull(),
  summary: jsonb("summary").notNull(),
  rawBytes: integer("raw_bytes").notNull(),
  data: bytea("data").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  removedBy: uuid("removed_by").references(() => users.id, { onDelete: "set null" }),
  removedAt: timestamp("removed_at", { mode: "date" }),
});

export const billsRelations = relations(bills, ({ many, one }) => ({
  items: many(billItems),
  payments: many(payments),
  gstCustomer: one(gstCustomers, {
    fields: [bills.gstCustomerId],
    references: [gstCustomers.id],
  }),
}));

export const billItemsRelations = relations(billItems, ({ one }) => ({
  bill: one(bills, { fields: [billItems.billId], references: [bills.id] }),
  lot: one(lots, { fields: [billItems.lotId], references: [lots.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  bill: one(bills, { fields: [payments.billId], references: [bills.id] }),
}));

export const lotsRelations = relations(lots, ({ many, one }) => ({
  stockIn: many(stockIn),
  billItems: many(billItems),
  transfers: many(transfers),
  cost: one(lotCosts, { fields: [lots.id], references: [lotCosts.lotId] }),
}));

export const stockInRelations = relations(stockIn, ({ one }) => ({
  lot: one(lots, { fields: [stockIn.lotId], references: [lots.id] }),
}));

export const transfersRelations = relations(transfers, ({ one }) => ({
  lot: one(lots, { fields: [transfers.lotId], references: [lots.id] }),
}));

export const openingDuesRelations = relations(openingDues, ({ many }) => ({
  payments: many(openingPayments),
}));

export const openingPaymentsRelations = relations(openingPayments, ({ one }) => ({
  due: one(openingDues, {
    fields: [openingPayments.openingDueId],
    references: [openingDues.id],
  }),
}));

export const hamaliPaidRelations = relations(hamaliPaid, ({ one }) => ({
  expense: one(expenses, {
    fields: [hamaliPaid.expenseId],
    references: [expenses.id],
  }),
}));

// Per-customer sticky notes shown on the Balances page. Keyed by customerKey()
// so the same note shows up regardless of casing / whitespace drift in how the
// name is typed on bills.
export const customerNotes = pgTable("customer_notes", {
  customerKey: text("customer_key").primaryKey(),
  note: text("note").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const pattiBillsRelations = relations(pattiBills, ({ many }) => ({
  payments: many(pattiPayments),
}));

export const pattiPaymentsRelations = relations(pattiPayments, ({ one }) => ({
  patti: one(pattiBills, { fields: [pattiPayments.pattiId], references: [pattiBills.id] }),
}));
