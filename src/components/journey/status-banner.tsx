"use client";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { MESSAGES } from "@/lib/messages";
import { useReplay } from "@/lib/replay-context";
import { cn } from "@/lib/utils";

export function StatusBanner() {
  const { frame } = useReplay();
  const msg = frame.messageId ? MESSAGES[frame.messageId] : null;
  if (!msg) return null;

  const styles = {
    info: "border-steel-300 bg-steel-50 text-navy-800",
    amber: "border-amber-pill-border bg-amber-pill text-amber-strong",
    green: "border-trust-500/40 bg-trust-50 text-trust-600",
    red: "border-warn-500/40 bg-warn-50 text-warn-600",
  } as const;
  const icons = {
    info: <Info className="h-5 w-5" aria-hidden />,
    amber: <AlertTriangle className="h-5 w-5" aria-hidden />,
    green: <CheckCircle2 className="h-5 w-5" aria-hidden />,
    red: <ShieldAlert className="h-5 w-5" aria-hidden />,
  } as const;

  return (
    <div
      className={cn("flex items-start gap-2.5 rounded-[8px] border p-3", styles[msg.severity])}
      role="status"
      aria-live="polite"
    >
      <span className="mt-0.5 shrink-0">{icons[msg.severity]}</span>
      <div>
        <p className="text-sm font-bold">{msg.title}</p>
        <p className="text-sm">{msg.body}</p>
      </div>
    </div>
  );
}
