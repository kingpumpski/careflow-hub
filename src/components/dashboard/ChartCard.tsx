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
    <section className={cn("surface-card p-4 sm:p-5 min-w-0", className)}>
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading font-semibold text-sm md:text-base leading-5 break-words">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-1 leading-5 break-words">{subtitle}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2 min-w-0 sm:shrink-0 [&>*]:max-w-full">{action}</div>}
      </header>
      <div className="min-w-0 w-full overflow-x-auto overscroll-x-contain">{children}</div>
    </section>
  );
}
