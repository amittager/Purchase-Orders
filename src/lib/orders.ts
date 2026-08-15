import { desc, eq } from "drizzle-orm";

import { orderEvents, purchaseOrders } from "@/db/schema";
import { db } from "@/lib/db";

/** Every order submitted by this requester, newest first — backs "My Orders". */
export async function listOrdersForRequester(email: string) {
  return db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.requesterEmail, email.toLowerCase()))
    .orderBy(desc(purchaseOrders.createdAt));
}

/** Every order awaiting a decision, newest first — backs "All Pending Approvals". Approver-only; callers must check `requireApprover()` first. */
export async function listPendingOrders() {
  return db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.status, "PENDING"))
    .orderBy(desc(purchaseOrders.createdAt));
}

export async function getOrderById(id: string) {
  const [order] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1);
  if (!order) return null;

  const events = await db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, id))
    .orderBy(desc(orderEvents.createdAt));

  return { order, events };
}

/** A requester may view their own order; an approver may view any order. */
export function canViewOrder(
  order: { requesterEmail: string },
  user: { email: string; isApprover: boolean },
) {
  return (
    user.isApprover ||
    order.requesterEmail.toLowerCase() === user.email.toLowerCase()
  );
}

/** True only while the order is still awaiting a decision. Guards against double-approving/rejecting on a stale page. */
export function isPending(order: { status: string }) {
  return order.status === "PENDING";
}

export async function withPendingOrder<T>(
  id: string,
  fn: (order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>["order"]) => Promise<T>,
) {
  const result = await getOrderById(id);
  if (!result) throw new Error("Order not found.");
  if (!isPending(result.order)) {
    throw new Error(
      `This order has already been ${result.order.status.toLowerCase()} and can't be changed.`,
    );
  }
  return fn(result.order);
}

export async function logOrderEvent(params: {
  orderId: string;
  action: "SUBMITTED" | "APPROVED" | "REJECTED";
  actorEmail: string;
  actorName?: string | null;
  notes?: string | null;
}) {
  await db.insert(orderEvents).values({
    orderId: params.orderId,
    action: params.action,
    actorEmail: params.actorEmail.toLowerCase(),
    actorName: params.actorName ?? null,
    notes: params.notes ?? null,
  });
}

export function formatOrderNumber(orderNumber: number): string {
  return `PO-${String(orderNumber).padStart(6, "0")}`;
}