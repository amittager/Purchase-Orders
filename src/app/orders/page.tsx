import { Plus } from "lucide-react";
import Link from "next/link";

import { OrderListTable } from "@/components/orders/order-list-table";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { listOrdersForRequester } from "@/lib/orders";

export const metadata = { title: "My Orders" };

export default async function MyOrdersPage() {
  // The `proxy` (src/proxy.ts) already redirects signed-out visitors to
  // /login before this ever renders; requireUser() here is defense in depth
  // and gives us the typed, guaranteed-present email/name.
  const user = await requireUser();
  const orders = await listOrdersForRequester(user.email);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Orders</h1>
          <p className="text-sm text-muted-foreground">
            Purchase orders you&apos;ve submitted, filtered by {user.email}.
          </p>
        </div>
        <Link href="/orders/new" className={buttonVariants()}>
          <Plus className="size-4" />
          New Order
        </Link>
      </div>

      <OrderListTable
        orders={orders}
        emptyMessage="You haven't submitted any purchase orders yet."
      />
    </div>
  );
}