import { Badge } from "@/components/ui/badge";
import { buildOperationalReportData, type OperationalAuditLog, type OperationalClaim, type OperationalInsurer, type OperationalOutstandingPeriod, type OperationalPayment, type OperationalProfile, type OperationalSettlementPeriod } from "@/modules/reports/operationalReportCalculations";

const money = (value: number | null) => value == null ? "—" : `GH¢ ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (value: number | null) => value == null ? "—" : `${value.toFixed(1)}%`;

export default function OperationalPerformanceReport(props: {
  claims: OperationalClaim[];
  insurers: OperationalInsurer[];
  payments: OperationalPayment[];
  settlementPeriods: OperationalSettlementPeriod[];
  outstandingPeriods: OperationalOutstandingPeriod[];
  auditLogs: OperationalAuditLog[];
  profiles: OperationalProfile[];
  canReadAudit: boolean;
  canReadClaims: boolean;
  settlementSourceUnavailable: boolean;
  outstandingSourceUnavailable: boolean;
  auditSourceUnavailable: boolean;
}) {
  const report = buildOperationalReportData(props);
  return <section className="space-y-6">
    <p className="text-sm text-muted-foreground">Operational indicators help identify rejection causes, insurer payment patterns, overdue claims cycles and outstanding follow-up priorities. Staff activity is based on claim audit events, not assigned caseload or hours worked.</p>
    <section className="stat-card space-y-3">
      <h3 className="font-semibold">Rejection analysis by reason</h3>
      {!props.canReadClaims ? <p className="text-sm text-muted-foreground">Claims read permission is required for rejection analysis.</p> : <div className="overflow-x-auto"><table className="data-table min-w-[650px]">
        <thead><tr><th>Category</th><th>Reason</th><th>Rejected claims</th><th>Rejected amount</th></tr></thead>
        <tbody>{report.rejectionReasons.map((row) => <tr key={row.category + row.reason}><td>{row.category}</td><td>{row.reason}</td><td>{row.count}</td><td className="text-destructive font-semibold">{money(row.amount)}</td></tr>)}
          {!report.rejectionReasons.length && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No rejected claims in the selected period.</td></tr>}</tbody>
      </table></div>}
    </section>
    <section className="stat-card space-y-3">
      <h3 className="font-semibold">Insurer performance</h3>
      {!props.canReadClaims ? <p className="text-sm text-muted-foreground">Claims read permission is required for insurer performance metrics.</p> : <>
        <div className="overflow-x-auto"><table className="data-table min-w-[1100px]">
          <thead><tr><th>Insurer</th><th>Claim records</th><th>Claims cycles</th><th>Submitted</th><th>Rejected</th><th>Net claim</th><th>Cash received</th><th>Outstanding</th><th>Denial rate</th><th>Recovery rate</th><th>Avg. days to pay</th></tr></thead>
          <tbody>{report.insurerPerformance.map((row) => <tr key={row.insurerId}>
            <td className="font-medium">{row.insurer}</td><td>{row.claimsCount}</td><td>{row.periodCount}</td><td>{money(row.submitted)}</td><td>{money(row.rejected)}</td><td>{money(row.netClaim)}</td><td>{money(row.paid)}</td>
            <td className={row.outstanding != null && row.outstanding > 0 ? "text-warning" : "text-success"}>{money(row.outstanding)}</td><td>{percent(row.denialRate)}</td><td>{percent(row.recoveryRate)}</td><td>{row.averageDaysToPay == null ? "—" : `${row.averageDaysToPay.toFixed(1)} days`}</td>
          </tr>)}{!report.insurerPerformance.length && <tr><td colSpan={11} className="py-6 text-center text-muted-foreground">No insurer activity in the selected period.</td></tr>}</tbody>
        </table></div>
        <p className="text-xs text-muted-foreground">Cash received uses claims-cycle totals when present; otherwise it uses payments linked to the selected claim records. Unlinked insurer-level receipts are not allocated to individual claims in the fallback measure.</p>
      </>}
    </section>
    <section className="stat-card space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Settlement delays</h3>{props.settlementSourceUnavailable && <Badge variant="destructive">Source unavailable</Badge>}</div>
      {props.settlementSourceUnavailable ? <p className="text-sm text-destructive">Settlement-cycle data could not be loaded. Delay totals are not shown as zero.</p> : <div className="overflow-x-auto"><table className="data-table min-w-[850px]">
        <thead><tr><th>Insurer</th><th>Claims month</th><th>Status</th><th>Days awaiting payment</th><th>Days to advice</th><th>Days to receipt</th><th>Advice date</th><th>Receipt date</th></tr></thead>
        <tbody>{report.settlementDelays.map((row) => <tr key={row.id}><td>{row.insurer}</td><td>{row.claimsMonth}</td><td><Badge variant={row.status === "awaiting_payment" ? "secondary" : "outline"}>{row.status.replaceAll("_", " ")}</Badge></td><td>{row.daysPending ?? "—"}</td><td>{row.daysToAdvice ?? "—"}</td><td>{row.daysToReceipt ?? "—"}</td><td>{row.adviceDate || "—"}</td><td>{row.receiptDate || "—"}</td></tr>)}
          {!report.settlementDelays.length && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No settlement cycles in the selected period.</td></tr>}</tbody>
      </table></div>}
    </section>
    <section className="stat-card space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Outstanding claims follow-up</h3>{props.outstandingSourceUnavailable && <Badge variant="destructive">Source unavailable</Badge>}</div>
      {!props.canReadClaims ? <p className="text-sm text-muted-foreground">Claims read permission is required for outstanding follow-up balances.</p> : props.outstandingSourceUnavailable ? <p className="text-sm text-destructive">Outstanding-period data could not be loaded. Follow-up balances are not shown as zero.</p> : <div className="overflow-x-auto"><table className="data-table min-w-[700px]">
        <thead><tr><th>Insurer</th><th>Claims month</th><th>Outstanding</th><th>Age</th><th>Tax basis</th><th>Priority</th></tr></thead>
        <tbody>{report.outstandingFollowUp.map((row) => <tr key={row.insurerId + row.claimsMonth}><td>{row.insurer}</td><td>{row.claimsMonth}</td><td className="font-semibold text-warning">{money(row.outstanding)}</td><td>{row.ageBand}</td><td>{row.taxBasis}</td><td><Badge variant={row.daysOutstanding > 90 ? "destructive" : row.daysOutstanding > 60 ? "secondary" : "outline"}>{row.daysOutstanding > 90 ? "Escalate" : row.daysOutstanding > 60 ? "Follow up" : "Monitor"}</Badge></td></tr>)}
          {!report.outstandingFollowUp.length && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No outstanding balances in the selected period.</td></tr>}</tbody>
      </table></div>}
    </section>
    <section className="stat-card space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Staff claims activity</h3>{!props.canReadAudit && <Badge variant="secondary">Audit permission required</Badge>}{props.auditSourceUnavailable && <Badge variant="destructive">Source unavailable</Badge>}</div>
      {!props.canReadAudit ? <p className="text-sm text-muted-foreground">This section requires Audit Trail read permission. It is not inferred from general report access.</p>
        : props.auditSourceUnavailable ? <p className="text-sm text-destructive">Audit activity could not be loaded.</p>
        : <><div className="overflow-x-auto"><table className="data-table min-w-[650px]">
          <thead><tr><th>Staff account</th><th>Claims created</th><th>Claims updated</th><th>Distinct claims touched</th><th>Last activity</th></tr></thead>
          <tbody>{report.staffActivity.map((row) => <tr key={row.actorId}><td>{row.staffName}</td><td>{row.inserts}</td><td>{row.updates}</td><td>{row.distinctClaimsTouched}</td><td>{new Date(row.lastActivity).toLocaleString()}</td></tr>)}
            {!report.staffActivity.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No claim audit activity in the selected period.</td></tr>}</tbody>
        </table></div><p className="text-xs text-muted-foreground">This is an audit-event count for the selected report scope, based on at most the latest 1,000 audit rows returned. Older events may be omitted in high-volume periods. It does not represent individual staff assignments, hours worked or productivity ranking.</p></>}
    </section>
  </section>;
}
