"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveOrder, rejectOrder, type DecisionState } from "@/lib/actions/orders";

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <CheckCircle2 className="size-4" />
      )}
      Approve &amp; sign receipt
    </Button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <XCircle className="size-4" />
      )}
      Reject
    </Button>
  );
}

/** Approve/reject controls shown to authorized approvers on a pending order. */
export function DecisionForm({ orderId }: { orderId: string }) {
  const [approveState, approveAction] = useActionState<DecisionState, FormData>(
    approveOrder,
    undefined,
  );
  const [rejectState, rejectAction] = useActionState<DecisionState, FormData>(
    rejectOrder,
    undefined,
  );
  const [showReject, setShowReject] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your decision</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {approveState?.error && <ErrorBanner message={approveState.error} />}
        {rejectState?.error && <ErrorBanner message={rejectState.error} />}

        <form action={approveAction} className="space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <Label htmlFor="approve-notes">Approval note (optional)</Label>
          <Textarea
            id="approve-notes"
            name="notes"
            rows={2}
            placeholder="Anything worth recording alongside the signed receipt..."
          />
          <ApproveButton />
        </form>

        {!showReject ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowReject(true)}
            className="text-muted-foreground"
          >
            Reject instead
          </Button>
        ) : (
          <form action={rejectAction} className="space-y-2 border-t pt-4">
            <input type="hidden" name="orderId" value={orderId} />
            <Label htmlFor="reject-notes">Reason for rejection</Label>
            <Textarea
              id="reject-notes"
              name="notes"
              rows={2}
              required
              placeholder="Explain why this order is being rejected..."
            />
            <RejectButton />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      {message}
    </div>
  );
}