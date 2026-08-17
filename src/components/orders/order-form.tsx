"use client";

import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { useActionState, useState } from "react";
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
import {
  createOrder,
  requestQuoteUploadUrl,
  type CreateOrderState,
} from "@/lib/actions/orders";

const CURRENCIES = ["USD", "EUR", "GBP", "ILS", "CAD", "AUD"];

/**
 * The quote file is uploaded straight to S3 as soon as it's picked (see
 * `handleFileChange` below), independently of the form's own submit —
 * `createOrder` only ever receives the resulting key/name as hidden fields,
 * never the file bytes. Keeps large uploads off this app's server entirely.
 */
type QuoteUploadState =
  | { status: "idle" }
  | { status: "uploading"; fileName: string }
  | { status: "done"; orderId: string; quoteFileKey: string; fileName: string }
  | { status: "error"; message: string };

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} className="w-full sm:w-auto">
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
  const [quoteUpload, setQuoteUpload] = useState<QuoteUploadState>({ status: "idle" });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setQuoteUpload({ status: "idle" });
      return;
    }

    setQuoteUpload({ status: "uploading", fileName: file.name });
    try {
      const result = await requestQuoteUploadUrl({
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || undefined,
      });
      if ("error" in result) {
        setQuoteUpload({ status: "error", message: result.error });
        return;
      }

      const upload = await fetch(result.uploadUrl, {
        method: "PUT",
        body: file,
        // uploadHeaders (x-amz-server-side-encryption) must be sent
        // verbatim — the presigned URL's signature requires it, see
        // getUploadUrl in lib/s3.ts.
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          ...result.uploadHeaders,
        },
      });
      if (!upload.ok) {
        setQuoteUpload({ status: "error", message: "Upload to storage failed. Please try again." });
        return;
      }

      setQuoteUpload({
        status: "done",
        orderId: result.orderId,
        quoteFileKey: result.quoteFileKey,
        fileName: file.name,
      });
    } catch {
      setQuoteUpload({ status: "error", message: "Upload failed. Please try again." });
    }
  }

  const canSubmit = quoteUpload.status === "done";

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
            {/* No `name` attribute — this file never travels with the form
                submit. It's uploaded straight to S3 on selection (see
                handleFileChange); orderId/quoteFileKey/quoteFileName below
                are what actually reach createOrder. */}
            <Input
              id="quoteFile"
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
              onChange={handleFileChange}
            />
            <input type="hidden" name="orderId" value={quoteUpload.status === "done" ? quoteUpload.orderId : ""} />
            <input
              type="hidden"
              name="quoteFileKey"
              value={quoteUpload.status === "done" ? quoteUpload.quoteFileKey : ""}
            />
            <input
              type="hidden"
              name="quoteFileName"
              value={quoteUpload.status === "done" ? quoteUpload.fileName : ""}
            />

            {quoteUpload.status === "uploading" && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Uploading {quoteUpload.fileName}…
              </p>
            )}
            {quoteUpload.status === "done" && (
              <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {quoteUpload.fileName} uploaded.
              </p>
            )}
            {quoteUpload.status === "error" && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="size-3.5" />
                {quoteUpload.message}
              </p>
            )}
            {quoteUpload.status === "idle" && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <UploadCloud className="size-3.5" />
                PDF, Word, Excel, or image — up to 15 MB.
              </p>
            )}
          </div>

          <SubmitButton disabled={!canSubmit} />
        </form>
      </CardContent>
    </Card>
  );
}