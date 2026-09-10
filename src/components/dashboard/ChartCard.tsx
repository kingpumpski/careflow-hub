import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function ChartCard({ title, subtitle, action, className, children }: ChartCardProps) {
  return (
    <section className={cn("surface-card p-4 sm:p-5 min-w-0 max-w-full overflow-hidden", className)}>
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 min-w-0 max-w-full">
        <div className="min-w-0 max-w-full flex-1 overflow-hidden">
          <h3 className="font-heading font-semibold text-sm md:text-base leading-5 break-words [overflow-wrap:anywhere]">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-1 leading-5 break-words [overflow-wrap:anywhere]">{subtitle}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full sm:shrink-0 [&>*]:max-w-full">{action}</div>}
      </header>
      <div className="min-w-0 max-w-full w-full overflow-x-auto overflow-y-hidden overscroll-x-contain">{children}</div>
    </section>
  );
}
