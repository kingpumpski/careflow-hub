import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KPICardProps {
  title: string;
  value: string;
  hint?: string;
  trend?: "up" | "down" | "flat";
  tone?: "primary" | "success" | "warning" | "destructive" | "accent" | "info";
  icon: LucideIcon;
  progress?: number;
  onClick?: () => void;
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

export default function KPICard({ title, value, hint, trend = "flat", tone = "primary", icon: Icon, progress, onClick }: KPICardProps) {
  const trendClass = trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "kpi-card group text-left w-full",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{title}</p>
          <p className="text-2xl font-bold font-heading mt-1.5 tabular-nums">{value}</p>
          {hint && <p className={cn("text-xs mt-1 font-medium truncate", trendClass)}>{hint}</p>}
        </div>
        <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", toneRing[tone])}>
          <Icon className="w-5 h-5" />
        </span>
      </div>
      {typeof progress === "number" && (
        <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-500", toneBar[tone])} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </button>
  );
}
