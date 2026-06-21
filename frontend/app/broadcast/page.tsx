"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/layout/Sidebar";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";

export default function BroadcastPage() {
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("all");
  const [count, setCount] = useState(0);
  const [countLoading, setCountLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  useEffect(() => {
    setCountLoading(true);
    api
      .get<{ count: number }>(`/broadcast/count?target=${target}`)
      .then((r) => setCount(r.count))
      .finally(() => setCountLoading(false));
  }, [target]);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const r = await api.post<{ sent: number; failed: number }>("/broadcast/send", { message, target });
      setResult(r);
      toast.success(`${r.sent} message(s) sent`);
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  const targets = [
    { key: "all", label: "All users" },
    { key: "active", label: "Users with active service" },
    { key: "inactive", label: "Users without service" },
  ];

  return (
    <AppShell>
      <div className="sticky top-0 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 mb-6 bg-background/95 backdrop-blur border-b border-border">
        <p className="text-sm text-text-muted">Recipients selected</p>
        <p className="text-3xl font-bold text-primary tabular-nums">
          {countLoading ? "…" : count.toLocaleString("en-US")}
        </p>
      </div>

      <h1 className="text-2xl font-bold mb-6">Broadcast message</h1>
      <Card className="max-w-2xl">
        <CardTitle className="mb-4">Audience</CardTitle>
        <div className="space-y-2 mb-6 text-sm">
          {targets.map((o) => (
            <label key={o.key} className="flex items-center gap-3 cursor-pointer py-1">
              <Checkbox
                checked={target === o.key}
                onCheckedChange={() => setTarget(o.key)}
              />
              {o.label}
            </label>
          ))}
        </div>
        <label className="text-sm text-text-secondary block mb-2">Message (HTML)</label>
        <textarea
          className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[160px] mb-4 font-latin"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="<b>Announcement</b>"
        />
        <div
          className="rounded-lg border border-border bg-background p-3 mb-4 text-sm min-h-[60px]"
          dangerouslySetInnerHTML={{ __html: message || "<span class='text-text-muted'>Preview…</span>" }}
        />
        <Button onClick={() => setConfirmOpen(true)} disabled={sending || !message.trim()}>
          {sending ? "Sending…" : "Send now"}
        </Button>
        {result && (
          <p className="text-sm text-text-secondary mt-4 tabular-nums">
            Sent: {result.sent} | Failed: {result.failed}
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm broadcast"
        confirmLabel="Send"
        loading={sending}
        onConfirm={send}
        description={
          <p>
            Send this message to <strong>{count.toLocaleString("en-US")}</strong> users?
          </p>
        }
      />
    </AppShell>
  );
}
