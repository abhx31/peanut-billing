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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("user_role", ["owner", "staff"]);
export const paymentModeEnum = pgEnum("payment_mode", ["Cash", "UPI"]);

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
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    no: integer("no").notNull(),
    fy: text("fy").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    customer: text("customer").notNull(),
    weightsText: text("weights_text"),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    lotNameSnapshot: text("lot_name_snapshot").notNull(),
    bags: integer("bags").notNull(),
    kg: numeric("kg", { precision: 14, scale: 3 }).notNull(),
    rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
    hamaliPerBag: numeric("hamali_per_bag", { precision: 14, scale: 2 }).notNull(),
    hamali: numeric("hamali", { precision: 14, scale: 2 }).notNull(),
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    gst: numeric("gst", { precision: 14, scale: 2 }).notNull().default("0"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bills_fy_no_uq").on(t.fy, t.no)],
);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  billId: uuid("bill_id")
    .notNull()
    .references(() => bills.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  mode: paymentModeEnum("mode").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
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
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  firm: text("firm").notNull().default("Peanut Traders"),
  hamaliDefault: numeric("hamali_default", { precision: 14, scale: 2 }).notNull().default("10"),
  openingCash: numeric("opening_cash", { precision: 14, scale: 2 }).notNull().default("0"),
  openingBank: numeric("opening_bank", { precision: 14, scale: 2 }).notNull().default("0"),
  extras: jsonb("extras"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const billsRelations = relations(bills, ({ one, many }) => ({
  lot: one(lots, { fields: [bills.lotId], references: [lots.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  bill: one(bills, { fields: [payments.billId], references: [bills.id] }),
}));

export const lotsRelations = relations(lots, ({ many, one }) => ({
  stockIn: many(stockIn),
  bills: many(bills),
  cost: one(lotCosts, { fields: [lots.id], references: [lotCosts.lotId] }),
}));

export const stockInRelations = relations(stockIn, ({ one }) => ({
  lot: one(lots, { fields: [stockIn.lotId], references: [lots.id] }),
}));
