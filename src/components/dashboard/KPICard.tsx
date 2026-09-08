import { useEffect, useState } from "react";
import { LucideIcon } from "lucide-react";
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

export default function KPICard({
  title, value, hint, trend = "flat", tone = "primary", icon: Icon, progress, onClick,
  frames, interval = 6000, frameIndex, frameCount,
}: KPICardProps) {
  const trendClass = trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";

  const slides: KPIFrame[] = [
    { label: "All time", value, hint, progress },
    ...(frames || []),
  ];
  const synced = typeof frameIndex === "number";
  const [localIndex, setLocalIndex] = useState(0);
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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        "kpi-card group text-left w-full overflow-hidden",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg",
      )}
    >
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
        <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", toneRing[tone])}>
          <Icon className="w-5 h-5" />
        </span>
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
    </button>
  );
}
