import type { ReactNode } from "react";
import { CheckCircle2, AlertTriangle, CircleAlert, CircleDashed, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type PillTone = "green" | "amber" | "red" | "blue" | "gray";

const toneStyles: Record<PillTone, string> = {
  green: "bg-trust-50 text-trust-600 border-trust-500/40",
  amber: "bg-amber-pill text-amber-strong border-amber-pill-border",
  red: "bg-warn-50 text-warn-600 border-warn-500/40",
  blue: "bg-steel-100 text-navy-700 border-steel-300",
  gray: "bg-surface-sunken text-ink-600 border-line",
};

const toneIcons: Record<PillTone, ReactNode> = {
  green: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
  amber: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
  red: <CircleAlert className="h-3.5 w-3.5" aria-hidden />,
  blue: <Info className="h-3.5 w-3.5" aria-hidden />,
  gray: <CircleDashed className="h-3.5 w-3.5" aria-hidden />,
};

export function StatusPill({
  tone,
  icon,
  children,
  className,
}: {
  tone: PillTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        toneStyles[tone],
        className,
      )}
    >
      {icon ?? toneIcons[tone]}
      {children}
    </span>
  );
}

export function Badge({
  tone = "gray",
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
