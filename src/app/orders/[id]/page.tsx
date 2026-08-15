import { FileText, Stamp } from "lucide-react";
import { notFound } from "next/navigation";

import { DecisionForm } from "@/components/orders/decision-form";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  canViewOrder,
  formatOrderNumber,
  getOrderById,
  isPending,
} from "@/lib/orders";

export default async function OrderDetailPage({
  params,
}: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const user = await requireUser();

  const result = await getOrderById(id);
  if (!result) notFound();
  const { order, events } = result;

  // 404 rather than 403 for orders the user has no relationship to, so we
  // don't reveal that a given order id exists to someone unrelated to it.
  if (!canViewOrder(order, user)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">
            {formatOrderNumber(order.orderNumber)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{order.title}</h1>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Detail label="Vendor" value={order.vendorName} />
          <Detail label="Amount" value={formatCurrency(order.amount, order.currency)} />
          <Detail
            label="Requested by"
            value={
              order.requesterName
                ? `${order.requesterName} (${order.requesterEmail})`
                : order.requesterEmail
            }
          />
          <Detail label="Submitted" value={formatDateTime(order.createdAt)} />
          {order.description && (
            <div className="sm:col-span-2">
              <Detail label="Description" value={order.description} />
            </div>
          )}
          <div className="sm:col-span-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Price quote / specification
            </p>
            <a
              href={`/api/orders/${order.id}/quote`}
              className={buttonVariants({ variant: "outline", size: "sm", className: "mt-1.5" })}
            >
              <FileText className="size-4" />
              {order.quoteFileName}
            </a>
          </div>
        </CardContent>
      </Card>

      {order.status !== "PENDING" && (
        <Card>
          <CardHeader>
            <CardTitle>Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Detail
              label={order.status === "APPROVED" ? "Approved by" : "Rejected by"}
              value={
                order.approverName
                  ? `${order.approverName} (${order.approverEmail})`
                  : (order.approverEmail ?? "—")
              }
            />
            <Detail
              label="Decided at"
              value={order.decidedAt ? formatDateTime(order.decidedAt) : "—"}
            />
            {order.decisionNotes && (
              <Detail label="Notes" value={order.decisionNotes} />
            )}
            {order.status === "APPROVED" && order.signedReceiptKey && (
              <a
                href={`/api/orders/${order.id}/receipt`}
                className={buttonVariants()}
              >
                <Stamp className="size-4" />
                Download approval receipt
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {isPending(order) && user.isApprover && <DecisionForm orderId={order.id} />}

      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {events.map((event) => (
                <li key={event.id} className="text-sm">
                  <p>
                    <span className="font-medium">{event.action}</span> by{" "}
                    {event.actorName || event.actorEmail}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </p>
                  {event.notes && (
                    <p className="mt-1 text-muted-foreground">{event.notes}</p>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-sm break-words">{value}</p>
    </div>
  );
}