"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { purchaseOrders } from "@/db/schema";
import { requireApprover, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatOrderNumber, logOrderEvent, withPendingOrder } from "@/lib/orders";
import { generateApprovalReceipt } from "@/lib/receipt-pdf";
import { buildObjectKey, uploadObject } from "@/lib/s3";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_QUOTE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const CreateOrderSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters.")
    .max(200, "Title is too long."),
  vendorName: z
    .string()
    .trim()
    .min(2, "Vendor name is required.")
    .max(200, "Vendor name is too long."),
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  currency: z
    .string()
    .trim()
    .length(3, "Use a 3-letter currency code, e.g. USD.")
    .default("USD"),
  description: z.string().trim().max(4000).optional(),
});

export type CreateOrderState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;

/** Server Action backing the "New Order" form: uploads the quote file to S3, then inserts the order row. */
export async function createOrder(
  _prevState: CreateOrderState,
  formData: FormData,
): Promise<CreateOrderState> {
  const user = await requireUser();

  const parsed = CreateOrderSchema.safeParse({
    title: formData.get("title"),
    vendorName: formData.get("vendorName"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const quoteFile = formData.get("quoteFile");
  if (!(quoteFile instanceof File) || quoteFile.size === 0) {
    return { error: "Please attach a price quote or specification file." };
  }
  if (quoteFile.size > MAX_FILE_BYTES) {
    return { error: "The attached file is larger than 15 MB." };
  }
  if (quoteFile.type && !ALLOWED_QUOTE_TYPES.has(quoteFile.type)) {
    return {
      error: "Unsupported file type. Upload a PDF, Word, Excel, or image file.",
    };
  }

  // Generate the id up front so the S3 key and the DB row can share it.
  const orderId = crypto.randomUUID();
  const quoteFileKey = buildObjectKey("quotes", orderId, quoteFile.name);
  const quoteBuffer = Buffer.from(await quoteFile.arrayBuffer());
  await uploadObject({
    key: quoteFileKey,
    body: quoteBuffer,
    contentType: quoteFile.type || "application/octet-stream",
  });

  await db.insert(purchaseOrders).values({
    id: orderId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    vendorName: parsed.data.vendorName,
    amount: parsed.data.amount.toFixed(2),
    currency: parsed.data.currency.toUpperCase(),
    requesterEmail: user.email,
    requesterName: user.name ?? null,
    quoteFileKey,
    quoteFileName: quoteFile.name,
  });

  await logOrderEvent({
    orderId,
    action: "SUBMITTED",
    actorEmail: user.email,
    actorName: user.name,
  });

  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export type DecisionState = { error: string } | undefined;

const NotesSchema = z.object({ notes: z.string().trim().max(2000).optional() });
const RejectSchema = z.object({
  notes: z.string().trim().min(1, "A reason is required to reject an order.").max(2000),
});

/**
 * Server Action backing the approve button: generates the approval
 * receipt (order details + "APPROVED" stamp), uploads it to S3, and flips
 * the order to APPROVED — all inside one action so the UI only has to
 * handle a single pending state.
 */
export async function approveOrder(
  _prevState: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const approver = await requireApprover();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Missing order id." };

  const parsed = NotesSchema.safeParse({ notes: formData.get("notes") || undefined });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await withPendingOrder(orderId, async (order) => {
      const decidedAt = new Date();

      const receipt = await generateApprovalReceipt({
        orderNumber: formatOrderNumber(order.orderNumber),
        title: order.title,
        vendorName: order.vendorName,
        amount: order.amount,
        currency: order.currency,
        description: order.description,
        requesterName: order.requesterName,
        requesterEmail: order.requesterEmail,
        approverName: approver.name,
        approverEmail: approver.email,
        decisionNotes: parsed.data.notes,
        approvedAt: decidedAt,
      });

      const receiptKey = buildObjectKey(
        "receipts",
        order.id,
        `approval-receipt-${formatOrderNumber(order.orderNumber)}.pdf`,
      );
      await uploadObject({
        key: receiptKey,
        body: receipt,
        contentType: "application/pdf",
      });

      await db
        .update(purchaseOrders)
        .set({
          status: "APPROVED",
          approverEmail: approver.email,
          approverName: approver.name ?? null,
          decisionNotes: parsed.data.notes ?? null,
          decidedAt,
          signedReceiptKey: receiptKey,
          updatedAt: decidedAt,
        })
        .where(eq(purchaseOrders.id, order.id));

      await logOrderEvent({
        orderId: order.id,
        action: "APPROVED",
        actorEmail: approver.email,
        actorName: approver.name,
        notes: parsed.data.notes,
      });
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/approvals");
  revalidatePath("/orders");
  return undefined;
}

/** Server Action backing the reject button. Requires a reason; no PDF/S3 involved. */
export async function rejectOrder(
  _prevState: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const approver = await requireApprover();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Missing order id." };

  const parsed = RejectSchema.safeParse({ notes: formData.get("notes") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await withPendingOrder(orderId, async (order) => {
      const decidedAt = new Date();

      await db
        .update(purchaseOrders)
        .set({
          status: "REJECTED",
          approverEmail: approver.email,
          approverName: approver.name ?? null,
          decisionNotes: parsed.data.notes,
          decidedAt,
          updatedAt: decidedAt,
        })
        .where(eq(purchaseOrders.id, order.id));

      await logOrderEvent({
        orderId: order.id,
        action: "REJECTED",
        actorEmail: approver.email,
        actorName: approver.name,
        notes: parsed.data.notes,
      });
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/approvals");
  revalidatePath("/orders");
  return undefined;
}