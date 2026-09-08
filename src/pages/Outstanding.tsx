import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type Status = "actual" | "provisional";

function daysOutstanding(year: number, month: number) {
  if (!year || !month) return 0;
  const periodEnd = new Date(year, month, 0);
  return Math.max(0, Math.floor((Date.now() - periodEnd.getTime()) / 86400000));
}

function bucketFor(days: number): "b30" | "b60" | "b90" | "b120" | "b120plus" {
  if (days <= 30) return "b30";
  if (days <= 60) return "b60";
  if (days <= 90) return "b90";
  if (days <= 120) return "b120";
  return "b120plus";
}

function money(value: number) {
  return `GH¢ ${Math.max(0, value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${status === "actual" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
      {status === "actual" ? "Actual" : "Provisional"}
    </span>
  );
}

export default function Outstanding() {
  const { data: periods, isLoading: periodsLoading } = useSupabaseQuery("claims_outstanding_periods");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const [filters, setFilters] = useState<any>({});
  const [detailInsurer, setDetailInsurer] = useState<string | null>(null);

  const insurerMap = useMemo(() => new Map((insurers || []).map((ins: any) => [ins.id, ins])), [insurers]);

  const periodRows = useMemo(() => {
    return (periods || []).map((p: any) => ({
      ...p,
      insurer: insurerMap.get(p.insurance_company_id),
      year: Number(p.period_year),
      month: Number(p.period_month),
      submitted: Number(p.submitted_amount || 0),
      rejected: Number(p.rejected_amount || 0),
      net: Number(p.net_claim_amount || 0),
      paid: Number(p.paid_amount || 0),
      tax: Number(p.withholding_tax_amount || 0),
      outstanding: Number(p.outstanding_amount || 0),
      status: (p.outstanding_status === "actual" ? "actual" : "provisional") as Status,
    }));
  }, [periods, insurerMap]);

  const filteredPeriods = useMemo(() => periodRows.filter((p: any) => {
    if (filters.company && p.insurance_company_id !== filters.company) return false;
    if (filters.month && p.month !== Number(filters.month)) return false;
    if (filters.year && p.year !== Number(filters.year)) return false;
    return true;
  }), [periodRows, filters]);

  const aggregated = useMemo(() => {
    const byInsurer = new Map<string, any>();
    filteredPeriods.forEach((p: any) => {
      if (!byInsurer.has(p.insurance_company_id)) {
        byInsurer.set(p.insurance_company_id, {
          ...(p.insurer || { id: p.insurance_company_id, company_name: "Unknown insurer" }),
          id: p.insurance_company_id,
          totalSubmitted: 0,
          totalRejected: 0,
          totalNet: 0,
          totalPaid: 0,
          totalTax: 0,
          outstanding: 0,
          periods: [],
          aging: { b30: 0, b60: 0, b90: 0, b120: 0, b120plus: 0 },
        });
      }
      const a = byInsurer.get(p.insurance_company_id);
      a.totalSubmitted += p.submitted;
      a.totalRejected += p.rejected;
      a.totalNet += p.net;
      a.totalPaid += p.paid;
      a.totalTax += p.tax;
      a.outstanding += p.outstanding;
      a.periods.push(p);
      if (p.outstanding > 0) a.aging[bucketFor(daysOutstanding(p.year, p.month))] += p.outstanding;
    });
    return Array.from(byInsurer.values()).map((a: any) => ({
      ...a,
      status: a.periods.length > 0 && a.periods.every((p: any) => p.status === "actual") ? "actual" : "provisional",
    }));
  }, [filteredPeriods]);

  const { sorted, sort, handleSort } = useSort(aggregated);
  const grandOutstanding = filteredPeriods.reduce((s: number, p: any) => s + p.outstanding, 0);
  const grandSubmitted = filteredPeriods.reduce((s: number, p: any) => s + p.submitted, 0);
  const grandRejected = filteredPeriods.reduce((s: number, p: any) => s + p.rejected, 0);
  const grandPaid = filteredPeriods.reduce((s: number, p: any) => s + p.paid, 0);
  const grandTax = filteredPeriods.reduce((s: number, p: any) => s + p.tax, 0);
  const grandStatus: Status = filteredPeriods.length > 0 && filteredPeriods.every((p: any) => p.status === "actual") ? "actual" : "provisional";
  const grandAging = filteredPeriods.reduce((acc: any, p: any) => {
    if (p.outstanding > 0) acc[bucketFor(daysOutstanding(p.year, p.month))] += p.outstanding;
    return acc;
  }, { b30: 0, b60: 0, b90: 0, b120: 0, b120plus: 0 });

  if (detailInsurer) {
    const ins = aggregated.find((a: any) => a.id === detailInsurer);
    if (!ins) {
      setDetailInsurer(null);
      return null;
    }
    const detailPeriods = [...ins.periods].sort((a: any, b: any) => b.year - a.year || b.month - a.month);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setDetailInsurer(null)}>← Back</Button>
          <div>
            <h1 className="page-title">{ins.company_name} — Outstanding</h1>
            <p className="page-description">System-calculated by claim period.</p>
          </div>
          <StatusBadge status={ins.status} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[['Submitted', ins.totalSubmitted, ''], ['Rejected', ins.totalRejected, 'text-destructive'], ['Net Claim', ins.totalNet, ''], ['Paid', ins.totalPaid, 'text-success'], ['WHT', ins.totalTax, 'text-warning'], ['Outstanding', ins.outstanding, 'text-destructive']].map(([label, value, cls]: any) => (
            <div className="stat-card text-center" key={label}><p className={`text-xl font-bold font-heading ${cls}`}>{money(value)}</p><p className="text-xs text-muted-foreground mt-1">{label}</p></div>
          ))}
        </div>
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-1">Period Breakdown</h3>
          <p className="text-xs text-muted-foreground mb-4">Actual = payment and withholding-tax entries are recorded. Provisional = one or both are still outstanding.</p>
          <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Period</th><th>Submitted</th><th>Rejected</th><th>Net Claim</th><th>Paid</th><th>WHT</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>
            {detailPeriods.map((p: any) => <tr key={`${p.year}-${p.month}`}><td className="font-medium">{monthNames[p.month]} {p.year}</td><td>{money(p.submitted)}</td><td className="text-destructive">{money(p.rejected)}</td><td>{money(p.net)}</td><td className="text-success">{money(p.paid)}</td><td className="text-warning">{money(p.tax)}</td><td className="text-destructive font-semibold">{money(p.outstanding)}</td><td><StatusBadge status={p.status} /></td></tr>)}
          </tbody></table></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Outstanding Claims</h1><p className="page-description">Outstanding = Submitted − Rejected − Payment Received − Withholding Tax. Values are recalculated from the underlying records.</p></div>
      <FilterBar filters={filters} onChange={setFilters} showCompany />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="stat-card"><p className="text-xs text-muted-foreground">All-Time Outstanding</p><p className="text-3xl font-bold font-heading text-destructive mt-1">{money(grandOutstanding)}</p><div className="mt-2"><StatusBadge status={grandStatus} /></div></div>
        <div className="stat-card"><p className="text-xs text-muted-foreground">Submitted</p><p className="text-2xl font-bold font-heading mt-1">{money(grandSubmitted)}</p></div>
        <div className="stat-card"><p className="text-xs text-muted-foreground">Paid + WHT</p><p className="text-2xl font-bold font-heading text-success mt-1">{money(grandPaid + grandTax)}</p></div>
        <div className="stat-card"><p className="text-xs text-muted-foreground">Rejected</p><p className="text-2xl font-bold font-heading text-destructive mt-1">{money(grandRejected)}</p></div>
      </div>
      <div className="stat-card"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-heading font-semibold">Outstanding Aging</h3><p className="text-xs text-muted-foreground">Based on the claim period end date.</p></div></div><div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        {[["0 – 30 days", grandAging.b30, "text-success"],["31 – 60 days", grandAging.b60, "text-info"],["61 – 90 days", grandAging.b90, "text-warning"],["91 – 120 days", grandAging.b120, "text-warning"],["120+ days", grandAging.b120plus, "text-destructive"]].map(([label, value, cls]: any) => <div className="text-center" key={label}><p className={`text-lg font-bold font-heading ${cls}`}>{money(value)}</p><p className="text-xs text-muted-foreground mt-1">{label}</p></div>)}
      </div></div>
      <div className="stat-card">
        {periodsLoading ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div> : <div className="overflow-x-auto"><table className="data-table"><thead><tr>
          <SortableHeader label="Insurance Company" sortKey="company_name" currentSort={sort} onSort={handleSort} />
          <SortableHeader label="Submitted" sortKey="totalSubmitted" currentSort={sort} onSort={handleSort} />
          <SortableHeader label="Rejected" sortKey="totalRejected" currentSort={sort} onSort={handleSort} />
          <SortableHeader label="Paid" sortKey="totalPaid" currentSort={sort} onSort={handleSort} />
          <SortableHeader label="WHT" sortKey="totalTax" currentSort={sort} onSort={handleSort} />
          <SortableHeader label="Outstanding" sortKey="outstanding" currentSort={sort} onSort={handleSort} />
          <th>Status</th><th>Periods</th>
        </tr></thead><tbody>
          {sorted.map((a: any) => <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailInsurer(a.id)}><td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || "#3b82f6" }} />{a.company_name}</div></td><td>{money(a.totalSubmitted)}</td><td className="text-destructive">{money(a.totalRejected)}</td><td className="text-success">{money(a.totalPaid)}</td><td className="text-warning">{money(a.totalTax)}</td><td className="text-destructive font-bold">{money(a.outstanding)}</td><td><StatusBadge status={a.status} /></td><td>{a.periods.length}</td></tr>)}
          {sorted.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No claim-period data available.</td></tr>}
        </tbody>{sorted.length > 0 && <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>{money(grandSubmitted)}</td><td className="text-destructive">{money(grandRejected)}</td><td className="text-success">{money(grandPaid)}</td><td className="text-warning">{money(grandTax)}</td><td className="text-destructive">{money(grandOutstanding)}</td><td><StatusBadge status={grandStatus} /></td><td>{filteredPeriods.length}</td></tr></tfoot>}</table></div>}
      </div>
    </div>
  );
}
