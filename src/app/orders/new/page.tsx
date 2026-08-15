import { OrderForm } from "@/components/orders/order-form";

export const metadata = { title: "New Purchase Order" };

export default function NewOrderPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Purchase Order</h1>
        <p className="text-sm text-muted-foreground">
          Attach a price quote or specification — it&apos;s stored alongside
          the request for the approver to review.
        </p>
      </div>
      <OrderForm />
    </div>
  );
}