import { useEffect, useId, useState } from "react";
import { Info, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KPIFrame {
  label: string;
  value: string;
  hint?: string;
  progress?: number;
}

export interface KPICardProps {
  title: string;
  value: string;
  hint?: string;
  /** Plain-language explanation shown in the KPI tooltip and to assistive technology. */
  description?: string;
  trend?: "up" | "down" | "flat";
  tone?: "primary" | "success" | "warning" | "destructive" | "accent" | "info";
  icon: LucideIcon;
  progress?: number;
  onClick?: () => void;
  /** Optional extra slides (e.g. yearly figures) cycled through inside the same card. */
  frames?: KPIFrame[];
  /** Milliseconds each slide stays visible. */
  interval?: number;
  /** Externally-driven slide index so multiple cards stay in sync. */
  frameIndex?: number;
  /** Total slides across the shared cycle (for badge/dots rendering when synced). */
  frameCount?: number;
}

const toneRing: Record<NonNullable<KPICardProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  accent: "bg-accent/10 text-accent",
  info: "bg-info/10 text-info",
};

const toneBar: Record<NonNullable<KPICardProps["tone"]>, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  accent: "bg-accent",
  info: "bg-info",
};

const defaultDescriptions: Record<string, string> = {
  "Total Claims Submitted": "Gross value of all claims submitted during the selected reporting scope, including claims that were later rejected.",
  "Total Payments Received": "Cash payments actually received from insurers and recorded against claims. Withholding tax is tracked separately and is not counted as cash received.",
  "Outstanding Balance": "Amount still due after subtracting rejected claims, recorded cash payments, and recorded withholding tax from gross submitted claims. The balance is provisional until settlement entries are reconciled.",
  "Rejected Amount": "Total value of claims that have been rejected. Rejected claims remain part of gross submitted value and are deducted once when calculating the outstanding balance.",
  "Rejection Rate": "Percentage of gross submitted claim value that has been rejected: rejected amount divided by gross submitted amount.",
  "Collection Rate": "Percentage of gross submitted claim value collected as recorded cash payments: payments received divided by gross submitted amount.",
  "Avg Settlement Period": "Average number of days between claim submission and recorded payment for settled claims.",
  "Pre-Authorizations": "Number of pre-authorization requests recorded in CareFlow Hub, including requests awaiting approval.",
};

export default function KPICard({
  title, value, hint, description, trend = "flat", tone = "primary", icon: Icon, progress, onClick,
  frames, interval = 6000, frameIndex, frameCount,
}: KPICardProps) {
  const trendClass = trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";
  const tooltipId = useId();
  const descriptionId = `${tooltipId}-description`;
  const resolvedDescription = description || defaultDescriptions[title] || `${title} provides a summary measure for the current claims-management workspace.`;

  const slides: KPIFrame[] = [
    { label: "All time", value, hint, progress },
    ...(frames || []),
  ];
  const synced = typeof frameIndex === "number";
  const [localIndex, setLocalIndex] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (synced || slides.length < 2 || paused) return;
    const id = window.setInterval(() => setLocalIndex((i) => (i + 1) % slides.length), interval);
    return () => window.clearInterval(id);
  }, [synced, slides.length, paused, interval]);

  useEffect(() => {
    if (localIndex >= slides.length) setLocalIndex(0);
  }, [slides.length, localIndex]);

  const slideCount = synced ? Math.min(frameCount ?? slides.length, slides.length) : slides.length;
  const index = synced ? Math.min(frameIndex ?? 0, slides.length - 1) : localIndex;
  const active = slides[Math.min(index, slides.length - 1)];

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
    if (event.key === "Escape") setInfoOpen(false);
  };

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-describedby={descriptionId}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => { setPaused(true); setInfoOpen(true); }}
      onMouseLeave={() => { setPaused(false); setInfoOpen(false); }}
      onFocus={() => setInfoOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInfoOpen(false);
      }}
      className={cn(
        "kpi-card group relative text-left w-full overflow-visible",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2",
      )}
    >
      <span id={descriptionId} className="sr-only">{resolvedDescription}</span>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{title}</p>
            {slideCount > 1 && (
              <span
                key={`badge-${index}`}
                className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 animate-scale-in tabular-nums",
                  toneRing[tone],
                )}
              >
                {active.label}
              </span>
            )}
          </div>

          <div key={`slide-${index}`} className="animate-fade-in">
            <p className="text-2xl font-bold font-heading mt-1.5 tabular-nums">{active.value}</p>
            {active.hint && <p className={cn("text-xs mt-1 font-medium truncate", trendClass)}>{active.hint}</p>}
          </div>
        </div>

        <div className="flex items-start gap-2 shrink-0">
          <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105", toneRing[tone])}>
            <Icon className="w-5 h-5" aria-hidden="true" />
          </span>
          <button
            type="button"
            aria-label={`What ${title} means`}
            aria-describedby={descriptionId}
            aria-expanded={infoOpen}
            onClick={(event) => { event.stopPropagation(); setInfoOpen((open) => !open); }}
            onMouseEnter={() => setInfoOpen(true)}
            onFocus={() => setInfoOpen(true)}
            className="w-7 h-7 -mr-1 -mt-1 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-colors"
          >
            <Info className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {typeof active.progress === "number" && (
        <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700 ease-out", toneBar[tone])}
            style={{ width: `${Math.max(0, Math.min(100, active.progress))}%` }}
          />
        </div>
      )}

      {slideCount > 1 && (
        <div className="mt-3 flex items-center gap-1">
          {slides.slice(0, slideCount).map((s, i) => (
            <span
              key={s.label}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                i === index ? cn("w-5", toneBar[tone]) : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>
      )}

      <div
        role="tooltip"
        aria-hidden={!infoOpen}
        className={cn(
          "absolute z-50 left-0 right-0 top-full mt-2 rounded-xl border border-border bg-popover/95 p-3 text-xs leading-relaxed text-popover-foreground shadow-xl backdrop-blur-sm transition-all duration-150",
          infoOpen ? "opacity-100 translate-y-0 visible" : "opacity-0 -translate-y-1 invisible pointer-events-none",
        )}
      >
        <div className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
          <p>{resolvedDescription}</p>
        </div>
      </div>
    </div>
  );
}
