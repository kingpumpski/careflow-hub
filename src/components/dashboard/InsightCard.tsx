import { AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardInsight } from "@/modules/analytics";

const toneMap = {
  positive: { icon: CheckCircle2, wrap: "border-success/30 bg-success/5", badge: "bg-success/15 text-success" },
  warning: { icon: AlertTriangle, wrap: "border-warning/30 bg-warning/5", badge: "bg-warning/15 text-warning" },
  critical: { icon: AlertTriangle, wrap: "border-destructive/30 bg-destructive/5", badge: "bg-destructive/15 text-destructive" },
  neutral: { icon: Info, wrap: "border-border bg-muted/30", badge: "bg-primary/10 text-primary" },
} as const;

export default function InsightCard({ insight }: { insight: DashboardInsight }) {
  const tone = toneMap[insight.tone] ?? toneMap.neutral;
  const Icon = tone.icon;

  return (
    <article className={cn("rounded-xl border p-4 flex gap-3 transition-colors", tone.wrap)}>
      <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", tone.badge)}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold font-heading">{insight.title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.body}</p>
      </div>
    </article>
  );
}

export function AIInsightBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">
      <Sparkles className="w-3 h-3" /> AI Layer
    </span>
  );
}
