import { useMemo } from "react";

type OHLCPoint = {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  submitted: number;
  paid: number;
  withholdingTax: number;
};

type WaterfallPoint = { label: string; value: number; kind: "start" | "positive" | "negative" | "end" };
type ParetoPoint = { label: string; value: number; cumulative: number };
type HeatmapPoint = { label: string; values: number[] };
type FunnelPoint = { label: string; value: number };

const money = (value: number) => `GH¢ ${Math.round(value).toLocaleString()}`;

function EmptyState({ label }: { label: string }) {
  return <div className="h-64 flex items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">{label}</div>;
}

export function ClaimsExposureCandlestick({ data }: { data: OHLCPoint[] }) {
  const max = Math.max(...data.flatMap((d) => [d.high, d.open, d.close, d.low]), 1);
  if (!data.length) return <EmptyState label="No monthly claims exposure data available yet" />;

  return (
    <div className="space-y-3">
      <div className="h-72 flex items-end gap-1 sm:gap-2 overflow-x-auto px-2 pb-2">
        {data.map((d) => {
          const scale = (v: number) => Math.max(2, (v / max) * 220);
          const bodyTop = Math.max(d.open, d.close);
          const bodyBottom = Math.min(d.open, d.close);
          const bodyHeight = Math.max(5, scale(bodyTop - bodyBottom));
          const isImproving = d.close <= d.open;
          return (
            <div key={d.label} className="min-w-8 sm:min-w-10 flex-1 h-full flex flex-col items-center justify-end group">
              <div className="relative w-full h-60 flex items-end justify-center">
                <div className="absolute bottom-0 h-[220px] w-px bg-border" />
                <div className="absolute w-0.5 rounded-full bg-foreground/60" style={{ height: `${Math.max(4, scale(d.high - d.low))}px`, bottom: `${scale(d.low)}px` }} />
                <div
                  className={`absolute w-4 sm:w-5 rounded-sm border ${isImproving ? "bg-success/30 border-success" : "bg-destructive/30 border-destructive"}`}
                  style={{ height: `${bodyHeight}px`, bottom: `${scale(bodyBottom)}px` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground mt-1">{d.label}</span>
              <div className="hidden group-hover:block absolute z-10 rounded-lg border bg-card p-2 text-[10px] shadow-lg -translate-y-2">
                <div className="font-semibold mb-1">{d.label}</div>
                <div>Open: {money(d.open)}</div><div>High: {money(d.high)}</div>
                <div>Low: {money(d.low)}</div><div>Close: {money(d.close)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Open = prior closing outstanding</span><span>High = exposure after submissions</span>
        <span>Low = post-settlement exposure</span><span>Close = period-end outstanding</span>
      </div>
    </div>
  );
}

export function ClaimsWaterfall({ data }: { data: WaterfallPoint[] }) {
  if (!data.length) return <EmptyState label="No reconciliation data available yet" />;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const running = data.reduce<number[]>((acc, d, i) => {
    const previous = i === 0 ? 0 : acc[i - 1];
    acc.push(d.kind === "start" || d.kind === "end" ? d.value : previous + d.value);
    return acc;
  }, []);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] h-72 flex items-end gap-3 px-3 pb-8">
        {data.map((d, i) => {
          const value = d.kind === "start" || d.kind === "end" ? d.value : d.value;
          const height = Math.max(6, (Math.abs(value) / max) * 190);
          const positive = d.kind === "positive";
          return (
            <div key={`${d.label}-${i}`} className="flex-1 min-w-16 h-full flex flex-col items-center justify-end gap-2">
              <span className="text-[10px] font-medium text-center max-w-20 truncate">{money(value)}</span>
              <div className={`w-full max-w-16 rounded-t-md transition-transform hover:-translate-y-1 ${d.kind === "negative" ? "bg-destructive/70" : d.kind === "positive" ? "bg-success/70" : "bg-primary/70"}`} style={{ height }} title={`${d.label}: ${money(value)}`} />
              <span className="text-[10px] text-muted-foreground text-center leading-tight">{d.label}</span>
              {i < data.length - 1 && <span className="hidden" aria-hidden="true">{positive ? running[i] : ""}</span>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground px-3">Positive bars increase the receivable exposure; negative bars reduce it through rejection, payment, or withholding-tax settlement.</p>
    </div>
  );
}

export function ClaimsPareto({ data }: { data: ParetoPoint[] }) {
  if (!data.length) return <EmptyState label="No rejection concentration data available yet" />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      <div className="h-64 flex items-end gap-1 sm:gap-2 border-b px-2">
        {data.map((d) => (
          <div key={d.label} className="flex-1 min-w-6 h-full flex flex-col justify-end items-center group">
            <div className="w-full max-w-10 rounded-t bg-destructive/70 hover:bg-destructive transition-colors" style={{ height: `${Math.max(2, (d.value / max) * 190)}px` }} title={`${d.label}: ${money(d.value)}`} />
            <span className="text-[9px] text-muted-foreground mt-1 truncate max-w-full">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>Highest rejection concentration</span><span>{data.at(-1)?.cumulative.toFixed(0)}% cumulative</span></div>
      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(data.at(-1)?.cumulative ?? 0, 100)}%` }} /></div>
      <p className="text-xs text-muted-foreground">Bars rank rejection value from highest to lowest. The cumulative indicator shows how much of total rejection value is represented by the displayed categories.</p>
    </div>
  );
}

export function ClaimsHeatmap({ data }: { data: HeatmapPoint[] }) {
  const max = useMemo(() => Math.max(...data.flatMap((d) => d.values), 1), [data]);
  if (!data.length) return <EmptyState label="No operational activity data available yet" />;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px] space-y-2">
        <div className="grid grid-cols-[120px_repeat(12,minmax(30px,1fr))] gap-1 text-[9px] text-muted-foreground">
          <span />
          {Array.from({ length: 12 }, (_, i) => <span key={i} className="text-center">{i + 1}</span>)}
          {data.map((row) => (
            <div key={row.label} className="contents">
              <span className="truncate self-center pr-2">{row.label}</span>
              {row.values.map((value, i) => (
                <span key={`${row.label}-${i}`} className="aspect-square rounded-sm border border-background" title={`${row.label}, month ${i + 1}: ${value}`} style={{ opacity: 0.15 + (value / max) * 0.85, background: "hsl(var(--primary))" }} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground"><span>Low activity</span><span>High activity</span></div>
      </div>
    </div>
  );
}

export function ClaimsFunnel({ data }: { data: FunnelPoint[] }) {
  if (!data.length) return <EmptyState label="No lifecycle funnel data available yet" />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3 py-2">
      {data.map((d, i) => {
        const width = Math.max(18, (d.value / max) * 100);
        const conversion = i === 0 ? 100 : (d.value / Math.max(data[i - 1].value, 1)) * 100;
        return (
          <div key={d.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs"><span className="font-medium">{d.label}</span><span className="text-muted-foreground">{d.value.toLocaleString()} · {conversion.toFixed(1)}% from prior stage</span></div>
            <div className="h-9 rounded-md bg-muted overflow-hidden"><div className="h-full rounded-md bg-primary/80 transition-all duration-500" style={{ width: `${width}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}
