import type { ReactNode } from "react";
import { Info, AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-line bg-white shadow-[0_1px_2px_rgba(10,37,64,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "amber" | "red" | "green";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-steel-300 bg-steel-50",
    amber: "border-amber-pill-border bg-amber-pill/50",
    red: "border-warn-500/40 bg-warn-50",
    green: "border-trust-500/40 bg-trust-50",
  } as const;
  const icons = {
    info: <Info className="h-4 w-4 text-navy-600" aria-hidden />,
    amber: <AlertTriangle className="h-4 w-4 text-amber-strong" aria-hidden />,
    red: <ShieldAlert className="h-4 w-4 text-warn-600" aria-hidden />,
    green: <CheckCircle2 className="h-4 w-4 text-trust-600" aria-hidden />,
  } as const;
  return (
    <div className={cn("rounded-[8px] border p-3", styles[tone], className)}>
      <div className="flex gap-2.5">
        <div className="mt-0.5 shrink-0">{icons[tone]}</div>
        <div className="min-w-0 text-sm">
          {title && <p className="font-semibold text-ink-900">{title}</p>}
          <div className="text-ink-600">{children}</div>
        </div>
      </div>
    </div>
  );
}
