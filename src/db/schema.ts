import { relations } from "drizzle-orm";
import {
  index,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Directory of everyone who has ever signed in with Google. Not used for
 * authorization (see `allowedApprovers` for that) — this is a reference
 * table kept in sync on every sign-in so orders/events can join against a
 * real user record instead of a bare email string if needed later.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The authorization list for managers/approvers. Membership here — not any
 * role stored on the user — is what allows someone to approve or reject a
 * purchase order. Managed out-of-band (e.g. directly in the DB, or a future
 * admin screen); seed it with `npm run db:seed`.
 */
export const allowedApprovers = pgTable("allowed_approvers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-friendly sequential number, rendered as e.g. "PO-000042". */
    orderNumber: serial("order_number").notNull(),

    title: text("title").notNull(),
    description: text("description"),
    vendorName: text("vendor_name").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),

    // Requester — captured from the authenticated Google session, not a
    // user-editable field, so "my orders" can always be filtered by email.
    requesterEmail: text("requester_email").notNull(),
    requesterName: text("requester_name"),

    // Uploaded price quote / specification file (S3 object key, not URL —
    // URLs are minted on demand as short-lived presigned links).
    quoteFileKey: text("quote_file_key").notNull(),
    quoteFileName: text("quote_file_name").notNull(),

    status: orderStatusEnum("status").notNull().default("PENDING"),

    // Populated once a manager makes a decision.
    approverEmail: text("approver_email"),
    approverName: text("approver_name"),
    decisionNotes: text("decision_notes"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),

    // Populated only on approval: the requester's own quote file
    // (`quoteFileKey`/`quoteFileName`), converted to PDF if it wasn't one
    // already, with the "APPROVED" stamp icon + sign-off date drawn onto
    // its last page — see `stampApprovalOnQuoteFile` in `receipt-pdf.ts`.
    signedReceiptKey: text("signed_receipt_key"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("purchase_orders_requester_email_idx").on(table.requesterEmail),
    index("purchase_orders_status_idx").on(table.status),
  ],
);

/**
 * Append-only audit trail. One row per state transition (submitted,
 * approved, rejected, ...), independent of the mutable `purchaseOrders`
 * row, so history survives even if the order itself is edited later.
 */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // "SUBMITTED" | "APPROVED" | "REJECTED"
    actorEmail: text("actor_email").notNull(),
    actorName: text("actor_name"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("order_events_order_id_idx").on(table.orderId)],
);

export const purchaseOrdersRelations = relations(
  purchaseOrders,
  ({ many }) => ({
    events: many(orderEvents),
  }),
);

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(purchaseOrders, {
    fields: [orderEvents.orderId],
    references: [purchaseOrders.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AllowedApprover = typeof allowedApprovers.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];