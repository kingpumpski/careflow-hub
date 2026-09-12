import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileCheck2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ClaimsSettlementPeriod } from '@/features/settlements/domain/settlement';
import { calculateSettlementReconciliation } from '@/features/settlements/domain/settlement';
import { isSettlementOverdue, summarizeSettlementPeriods, summarizeSettlementsByInsurer } from '@/features/settlements/domain/settlement-report';

type Row = Record<string, any>;

const money = (value: number) => value.toFixed(2);

export default function SettlementManagementReport({ periods }: { periods: Row[] }) {
  const normalized = useMemo<ClaimsSettlementPeriod[]>(() => periods.map((row) => ({
    id: row.id,
    facilityId: row.facility_id,
    insuranceCompanyId: row.insurance_company_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    periodType: row.period_type,
    totalClaimsSubmitted: Number(row.total_claims_submitted || 0),
    withholdingTaxRate: Number(row.withholding_tax_rate || 0),
    provisionalWithholdingTax: Number(row.provisional_withholding_tax || 0),
    paymentReceived: row.payment_received == null ? null : Number(row.payment_received),
    rejectionAmount: row.rejection_amount == null ? null : Number(row.rejection_amount),
    actualWithholdingTax: row.actual_withholding_tax == null ? null : Number(row.actual_withholding_tax),
    paymentAdviceReference: row.payment_advice_reference ?? null,
    paymentAdviceDate: row.payment_advice_date ?? null,
    settlementStatus: row.settlement_status,
    withholdingTaxVariance: row.withholding_tax_variance == null ? null : Number(row.withholding_tax_variance),
    confirmedBy: row.confirmed_by ?? null,
    confirmedAt: row.confirmed_at ?? null,
  })), [periods]);
  const summary = useMemo(() => summarizeSettlementPeriods(normalized), [normalized]);
  const insurers = useMemo(() => summarizeSettlementsByInsurer(normalized), [normalized]);
  const insurerNames = useMemo(() => new Map(periods.map((row) => [row.insurance_company_id, row.insurance_company_name || row.insurance_company_id])), [periods]);
  const reconciliationRate = summary.periodCount ? Math.round((summary.reconciledCount / summary.periodCount) * 100) : 0;
  const confirmed = useMemo(() => normalized.filter((period) => period.paymentReceived !== null && period.rejectionAmount !== null && period.actualWithholdingTax !== null), [normalized]);
  const reconciliationResults = useMemo(() => confirmed.map((period) => calculateSettlementReconciliation(period.totalClaimsSubmitted, period.rejectionAmount, period.paymentReceived, period.actualWithholdingTax)), [confirmed]);
  const balancedCount = reconciliationResults.filter((result) => result.balanced).length;
  const varianceCount = reconciliationResults.length - balancedCount;
  const outstanding = reconciliationResults.reduce((total, result) => total + result.outstanding, 0);
  const overdue = normalized.filter((period) => isSettlementOverdue(period));
  const variance = summary.totalWhtVariance;

  return <section className="stat-card space-y-4">
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div><h2 className="font-semibold">Management reconciliation report</h2><p className="text-sm text-muted-foreground">Operational summary of settlement completeness. Confirmed reconciliation uses submitted claims less rejections, payment received and actual WHT.</p></div>
      <Badge variant="secondary">CONFIRMED ADVICE DATA</Badge>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-md border p-3"><div className="flex items-center gap-2 text-sm text-muted-foreground"><FileCheck2 className="h-4 w-4" />Periods</div><div className="mt-1 text-2xl font-semibold">{summary.periodCount}</div></div>
      <div className="rounded-md border p-3"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" />Reconciled</div><div className="mt-1 text-2xl font-semibold">{summary.reconciledCount}<span className="ml-1 text-sm font-normal text-muted-foreground">({reconciliationRate}%)</span></div></div>
      <div className="rounded-md border p-3"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />Awaiting payment</div><div className="mt-1 text-2xl font-semibold">{summary.awaitingPaymentCount}</div></div>
      <div className="rounded-md border p-3"><div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4" />Variance periods</div><div className="mt-1 text-2xl font-semibold">{varianceCount}</div></div>
      <div className="rounded-md border p-3"><div className="text-sm text-muted-foreground">WHT variance</div><div className="mt-1 text-2xl font-semibold">{money(variance)}</div></div>
    </div>
    <div className="grid gap-4 md:grid-cols-5 text-sm">
      <div><span className="text-muted-foreground">Submitted</span><div className="font-medium">{money(summary.totalSubmitted)}</div></div>
      <div><span className="text-muted-foreground">Payment received</span><div className="font-medium">{money(summary.totalPaymentReceived)}</div></div>
      <div><span className="text-muted-foreground">Rejections</span><div className="font-medium">{money(summary.totalRejectionAmount)}</div></div>
      <div><span className="text-muted-foreground">Actual WHT</span><div className="font-medium">{money(summary.totalActualWht)}</div></div>
      <div><span className="text-muted-foreground">Confirmed outstanding*</span><div className="font-medium">{money(outstanding)}</div></div>
    </div>
    <p className="text-xs text-muted-foreground">*Confirmed outstanding is the canonical non-negative residual from periods with complete payment advice. Provisional WHT is never substituted for actual WHT.</p>
    {confirmed.length > 0 && <p className="text-xs text-muted-foreground">{balancedCount} confirmed period{balancedCount === 1 ? '' : 's'} balance to zero; {varianceCount} require variance review.</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Insurer</th><th className="p-2">Periods</th><th className="p-2">Awaiting</th><th className="p-2">Advice</th><th className="p-2">Reconciled</th><th className="p-2">Submitted</th><th className="p-2">Payment</th><th className="p-2">Rejections</th><th className="p-2">WHT variance</th></tr></thead><tbody>{insurers.map((row) => <tr className="border-b" key={row.insurerId}><td className="p-2">{insurerNames.get(row.insurerId) || row.insurerId}</td><td className="p-2">{row.periodCount}</td><td className="p-2">{row.awaitingPaymentCount}</td><td className="p-2">{row.adviceReceivedCount}</td><td className="p-2">{row.reconciledCount}</td><td className="p-2">{money(row.totalSubmitted)}</td><td className="p-2">{money(row.totalPaymentReceived)}</td><td className="p-2">{money(row.totalRejectionAmount)}</td><td className="p-2">{money(row.totalWhtVariance)}</td></tr>)}{!insurers.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No settlement data available for reporting.</td></tr>}</tbody></table></div>
    {overdue.length > 0 && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><div className="font-medium">Outstanding operational attention</div><p className="mt-1 text-muted-foreground">{overdue.length} settlement period{overdue.length === 1 ? '' : 's'} has remained in awaiting-payment status for at least {30} days. Review the exception register and external payment source.</p></div>}
  </section>;
}
