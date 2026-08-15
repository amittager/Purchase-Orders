import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { canViewOrder, getOrderById } from "@/lib/orders";
import { getDownloadUrl } from "@/lib/s3";

/**
 * Redirects to a freshly-minted, short-lived presigned S3 URL for the PDF
 * approval receipt. Only exists once an order is APPROVED.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getOrderById(id);
  if (!result) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!canViewOrder(result.order, user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!result.order.signedReceiptKey) {
    return NextResponse.json(
      { error: "This order has not been approved yet." },
      { status: 404 },
    );
  }

  const url = await getDownloadUrl(result.order.signedReceiptKey);
  return NextResponse.redirect(url);
}