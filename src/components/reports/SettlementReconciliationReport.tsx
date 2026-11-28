import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { buildSettlementReconciliationRows, summarizeSettlementReconciliationRows, type SettlementReconciliationSource } from "@/modules/reports/settlementReconciliationReport";

const money = (value: number | null) => value == null ? "—" : `GH¢ ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GH", { month: "long", year: "numeric" });
};

export default function SettlementReconciliationReport({ periods, insurers }: {
  periods: SettlementReconciliationSource[];
  insurers: Array<{ id: string; company_name: string }>;
}) {
  const rows = useMemo(() => buildSettlementReconciliationRows(periods), [periods]);
  const summary = useMemo(() => summarizeSettlementReconciliationRows(rows), [rows]);
  const names = useMemo(() => new Map(insurers.map((insurer) => [insurer.id, insurer.company_name])), [insurers]);

  return <section className="space-y-4">
    <p className="text-sm text-muted-foreground">Each advice is matched to its original claims cycle. Cash receipt month is kept separate from claims month; provisional WHT remains an estimate and is never added to confirmed actual WHT.</p>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      {[
        ["Claims periods", summary.periodCount],
        ["Awaiting advice", summary.awaitingPaymentCount],
        ["Submitted", money(summary.submitted)],
        ["Approved gross", money(summary.approvedGross)],
        ["Cash received", money(summary.cashReceived)],
        ["Actual WHT", money(summary.actualWht)],
        ["Provisional WHT", money(summary.provisionalWht)],
        ["Approval variance", money(summary.approvalVariance)],
        ["Approved unpaid", money(summary.approvedUnpaid)],
        ["Over-settled", money(summary.overSettled)],
        ["Balanced cycles", summary.balancedCount],
      ].map(([label, value]) => <div className="stat-card" key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}
    </div>
    <div className="overflow-x-auto rounded-md border">
      <table className="data-table min-w-[1250px]">
        <thead><tr>
          <th>Claims cycle</th><th>Insurer</th><th>Status</th><th>Submitted</th><th>Approved gross</th><th>Rejected</th><th>Approval variance</th><th>Provisional WHT</th><th>Actual WHT</th><th>Cash received</th><th>Approved unpaid</th><th>Advice reference</th><th>Receipt date</th>
        </tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.id}>
            <td>{monthLabel(row.periodStart)}</td>
            <td>{names.get(row.insuranceCompanyId) || "Unknown insurer"}</td>
            <td><Badge variant={row.status === "reconciled" ? "default" : row.status === "awaiting_payment" ? "secondary" : "outline"}>{row.status.replaceAll("_", " ")}</Badge></td>
            <td>{money(row.submitted)}</td><td>{money(row.approvedGross)}</td><td>{money(row.rejected)}</td>
            <td>{money(row.approvalVariance)}</td><td>{money(row.provisionalWht)}</td><td>{money(row.actualWht)}</td>
            <td>{money(row.cashReceived)}</td><td>{money(row.approvedUnpaid)}</td>
            <td>{row.adviceReference || "—"}</td><td>{row.receiptDate || "—"}</td>
          </tr>)}
          {rows.length === 0 && <tr><td colSpan={13} className="py-8 text-center text-muted-foreground">No settlement cycles are available for the selected reporting period.</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="text-xs text-muted-foreground">A dash means the source has not recorded that figure. Approved unpaid is calculated only when approved gross, rejection, actual WHT and cash received are all confirmed. Historical rows without approved gross are not reconstructed.</p>
  </section>;
}
