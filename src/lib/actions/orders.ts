"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { purchaseOrders } from "@/db/schema";
import { requireApprover, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatOrderNumber, logOrderEvent, withPendingOrder } from "@/lib/orders";
import { stampApprovalOnQuoteFile } from "@/lib/receipt-pdf";
import { buildObjectKey, downloadObject, getUploadUrl, UPLOAD_SSE_HEADER, uploadObject } from "@/lib/s3";

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

const RequestUploadSchema = z.object({
  fileName: z.string().trim().min(1, "Missing file name."),
  fileSize: z.coerce.number().int().positive("Empty file."),
  contentType: z.string().optional(),
});

export type RequestQuoteUploadState =
  | { error: string }
  | {
      orderId: string;
      quoteFileKey: string;
      uploadUrl: string;
      /** Headers the client's PUT to `uploadUrl` must send verbatim — see `getUploadUrl` in `s3.ts`. */
      uploadHeaders: Record<string, string>;
    };

/**
 * Server Action called directly from client code (not a `<form action>`) as
 * soon as a file is picked in the "New Order" form. Mints a presigned S3 PUT
 * URL so the browser can upload the file straight to S3 — the file's bytes
 * never pass through this app's server at all, which matters because
 * serverless hosts (e.g. Vercel) cap function request bodies at 4.5MB, well
 * under the 15MB this app allows. `createOrder` below only ever receives
 * the resulting object key, not the file itself.
 */
export async function requestQuoteUploadUrl(
  input: unknown,
): Promise<RequestQuoteUploadState> {
  await requireUser();

  const parsed = RequestUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid file." };
  }
  const { fileName, fileSize, contentType } = parsed.data;

  if (fileSize > MAX_FILE_BYTES) {
    return { error: "The attached file is larger than 15 MB." };
  }
  if (contentType && !ALLOWED_QUOTE_TYPES.has(contentType)) {
    return {
      error: "Unsupported file type. Upload a PDF, Word, Excel, or image file.",
    };
  }

  // Generated here (not in createOrder) so the same id threads through the
  // S3 key and, once the form is actually submitted, the DB row.
  const orderId = crypto.randomUUID();
  const quoteFileKey = buildObjectKey("quotes", orderId, fileName);
  const uploadUrl = await getUploadUrl(quoteFileKey);

  return { orderId, quoteFileKey, uploadUrl, uploadHeaders: UPLOAD_SSE_HEADER };
}

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
  orderId: z.string().uuid("Your upload session expired — please reselect the file."),
  quoteFileKey: z.string().trim().min(1, "Please attach a price quote or specification file."),
  quoteFileName: z.string().trim().min(1, "Please attach a price quote or specification file."),
});

export type CreateOrderState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | undefined;

/**
 * Server Action backing the "New Order" form. By the time this runs, the
 * quote file has already been uploaded straight to S3 by the browser (see
 * `requestQuoteUploadUrl`) — this just inserts the order row pointing at it.
 */
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
    orderId: formData.get("orderId"),
    quoteFileKey: formData.get("quoteFileKey"),
    quoteFileName: formData.get("quoteFileName"),
  });
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { orderId, quoteFileKey, quoteFileName } = parsed.data;
  // The client supplies orderId/quoteFileKey verbatim from requestQuoteUploadUrl's
  // response — this just checks they're actually the matching pair `getUploadUrl`
  // handed out (buildObjectKey always nests under `quotes/{orderId}/`), not a key
  // for an unrelated order or object.
  if (!quoteFileKey.startsWith(`quotes/${orderId}/`)) {
    return { error: "Upload session mismatch — please reselect your file and try again." };
  }

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
    quoteFileName,
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
 * Server Action backing the approve button: stamps the requester's own
 * quote file with the "APPROVED" stamp + sign-off date (converting it to
 * PDF first if it isn't one already — see `stampApprovalOnQuoteFile`),
 * uploads the result to S3, and flips the order to APPROVED — all inside
 * one action so the UI only has to handle a single pending state.
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

      const quoteBytes = await downloadObject(order.quoteFileKey);
      const receipt = await stampApprovalOnQuoteFile(
        { bytes: quoteBytes, fileName: order.quoteFileName },
        decidedAt,
      );

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