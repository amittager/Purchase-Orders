import { OrderListTable } from "@/components/orders/order-list-table";
import { requireApprover } from "@/lib/auth";
import { listPendingOrders } from "@/lib/orders";

export const metadata = { title: "All Pending Approvals" };

export default async function ApprovalsPage() {
  // Defense in depth — src/proxy.ts already keeps non-approvers out of
  // /approvals/*, but this page checks again in case it's ever reached a
  // different way (e.g. a future server action or direct data fetch).
  await requireApprover();
  const orders = await listPendingOrders();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          All Pending Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          Every purchase order awaiting a decision, from any requester.
        </p>
      </div>

      <OrderListTable
        orders={orders}
        showRequester
        emptyMessage="Nothing is waiting for approval right now."
      />
    </div>
  );
}