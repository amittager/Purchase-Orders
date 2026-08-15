"use client";

import { AlertCircle, Loader2, UploadCloud } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createOrder, type CreateOrderState } from "@/lib/actions/orders";

const CURRENCIES = ["USD", "EUR", "GBP", "ILS", "CAD", "AUD"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending && <Loader2 className="size-4 animate-spin" />}
      Submit Purchase Order
    </Button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

export function OrderForm() {
  const [state, formAction] = useActionState<CreateOrderState, FormData>(
    createOrder,
    undefined,
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-5">
          {state?.error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Replacement laptops for design team"
              required
              maxLength={200}
            />
            <FieldError errors={state?.fieldErrors?.title} />
          </div>

          <div className="grid gap-5 sm:grid-cols-[2fr_1fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="vendorName">Vendor</Label>
              <Input
                id="vendorName"
                name="vendorName"
                placeholder="e.g. Acme Supplies Inc."
                required
                maxLength={200}
              />
              <FieldError errors={state?.fieldErrors?.vendorName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                required
              />
              <FieldError errors={state?.fieldErrors?.amount} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select name="currency" defaultValue="USD">
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description / justification</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              placeholder="What is this for, and why is it needed?"
              maxLength={4000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quoteFile">Price quote / specification</Label>
            <Input
              id="quoteFile"
              name="quoteFile"
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
            />
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <UploadCloud className="size-3.5" />
              PDF, Word, Excel, or image — up to 15 MB.
            </p>
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}