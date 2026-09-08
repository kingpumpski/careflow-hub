import { useEffect, useState } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface YearlyValue {
  year: number;
  value: number;
}

interface YearlyMetricCardProps {
  title: string;
  total: number;
  yearly: YearlyValue[];
  format: (value: number) => string;
  hint?: string;
  tone?: "primary" | "success" | "warning" | "destructive";
  icon: LucideIcon;
  onClick?: () => void;
}

const toneRing = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export default function YearlyMetricCard({ title, total, yearly, format, hint, tone = "primary", icon: Icon, onClick }: YearlyMetricCardProps) {
  const [showYearly, setShowYearly] = useState(false);
  const [yearIndex, setYearIndex] = useState(0);

  useEffect(() => {
    if (!yearly.length) return;
    const revealTimer = window.setTimeout(() => setShowYearly(true), 7000);
    return () => window.clearTimeout(revealTimer);
  }, [yearly.length]);

  useEffect(() => {
    if (!showYearly || yearly.length < 2) return;
    const cycleTimer = window.setInterval(() => setYearIndex((index) => (index + 1) % yearly.length), 5000);
    return () => window.clearInterval(cycleTimer);
  }, [showYearly, yearly.length]);

  const current = showYearly && yearly.length ? yearly[yearIndex] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn("kpi-card group text-left w-full", onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg")}
      aria-label={`${title}: ${format(current?.value ?? total)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{title}</p>
          <div className="mt-1.5 min-h-[2.25rem]" key={current?.year ?? "total"}>
            {current && <p className="text-xs font-bold text-primary animate-in fade-in slide-in-from-bottom-1 duration-500">{current.year}</p>}
            <p className="text-2xl font-bold font-heading tabular-nums animate-in fade-in duration-500">{format(current?.value ?? total)}</p>
          </div>
          <p className="text-xs mt-1 font-medium text-muted-foreground truncate">{current ? `Aggregated total for ${current.year}` : hint || "All-time total"}</p>
        </div>
        <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", toneRing[tone])}>
          <Icon className="w-5 h-5" />
        </span>
      </div>
    </button>
  );
}