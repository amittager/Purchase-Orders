import Link from "next/link";

import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PurchaseOrder } from "@/db/schema";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { formatOrderNumber } from "@/lib/orders";

export function OrderListTable({
  orders,
  showRequester = false,
  emptyMessage,
}: {
  orders: PurchaseOrder[];
  showRequester?: boolean;
  emptyMessage: string;
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order #</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Vendor</TableHead>
            {showRequester && <TableHead>Requester</TableHead>}
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="group">
              <TableCell className="font-mono text-xs">
                <Link
                  href={`/orders/${order.id}`}
                  className="font-medium text-foreground group-hover:underline"
                >
                  {formatOrderNumber(order.orderNumber)}
                </Link>
              </TableCell>
              <TableCell className="max-w-56 truncate">{order.title}</TableCell>
              <TableCell className="max-w-40 truncate text-muted-foreground">
                {order.vendorName}
              </TableCell>
              {showRequester && (
                <TableCell className="max-w-48 truncate text-muted-foreground">
                  {order.requesterName || order.requesterEmail}
                </TableCell>
              )}
              <TableCell>{formatCurrency(order.amount, order.currency)}</TableCell>
              <TableCell>
                <OrderStatusBadge status={order.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(order.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}