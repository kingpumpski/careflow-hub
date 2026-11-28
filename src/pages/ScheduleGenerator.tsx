import { useMemo, useState } from "react";
import { ClipboardList, FileDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { buildLetterheadConfig } from "@/lib/letterhead";
import { buildReportPDFBlob, exportReportExcel } from "@/lib/exportUtils";
import { PdfPreviewDialog } from "@/components/shared/DocumentPreviewDialogs";
import { useDocumentLetterheadSettings } from "@/modules/reports/useDocumentLetterheadSettings";
import { usePermissions } from "@/modules/security/usePermissions";
import { calculateClaimGrossTotals, calculateClaimsScheduleBalance } from "@/modules/reports/claimsReportCalculations";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Row {
  period: string;
  withholdingTax: number;
  submitted: number;
  rejected: number;
  paid: number;
  outstanding: number;
  rejectionRate: number;
}
interface ScheduleClaimRow {
  claim_year: number | string | null;
  claim_month: number | string | null;
  insurance_company_id: string;
  claim_amount: number | string | null;
  status?: string | null;
}
interface SchedulePaymentRow {
  claim_year: number | string | null;
  claim_month: number | string | null;
  insurance_company_id: string;
  amount_paid: number | string | null;
}
interface ScheduleTaxRow {
  year: number | string;
  month: number | string;
  insurance_company_id: string;
  tax_amount: number | string | null;
  is_actual: boolean;
}
interface ScheduleSettlementRow {
  period_type: string;
  period_start: string;
  insurance_company_id: string;
  total_claims_submitted: number | string | null;
  rejection_amount: number | string | null;
  approved_gross_amount: number | string | null;
  payment_received: number | string | null;
  actual_withholding_tax: number | string | null;
  settlement_status: string;
}

export default function ScheduleGenerator() {
  const { can } = usePermissions();
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: claims } = useSupabaseQuery("claims");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const { data: settlementPeriods } = useSupabaseQuery("claims_settlement_periods");
  const claimRows = useMemo(() => (claims || []) as unknown as ScheduleClaimRow[], [claims]);
  const paymentRows = useMemo(() => (payments || []) as unknown as SchedulePaymentRow[], [payments]);
  const taxRows = useMemo(() => (withholdingTax || []) as unknown as ScheduleTaxRow[], [withholdingTax]);
  const settlementRows = useMemo(() => (settlementPeriods || []) as unknown as ScheduleSettlementRow[], [settlementPeriods]);
  const { data: settings } = useDocumentLetterheadSettings({ canReadDocument: can("reports.read"), canManageSettings: can("settings.manage") });

  const currentYear = new Date().getFullYear();
  const [insurerId, setInsurerId] = useState("all");
  const [year, setYear] = useState(String(currentYear));
  const [fromMonth, setFromMonth] = useState("1");
  const [toMonth, setToMonth] = useState("12");
  const [generated, setGenerated] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    (claims || []).forEach((c: any) => c.claim_year && set.add(Number(c.claim_year)));
    return Array.from(set).sort((a, b) => b - a);
  }, [claims, currentYear]);

  const companyInfo = useMemo(
    () => buildLetterheadConfig((k: string) => (settings || []).find((s: any) => s.key === k)?.value || ""),
    [settings]
  );

  const selectedInsurer = insurerId === "all" ? undefined : (insurers || []).find((i: any) => i.id === insurerId);
  const insurerName = insurerId === "all" ? "All Insurance Companies" : selectedInsurer?.company_name || "";
  const insurerDocumentDetails = selectedInsurer ? {
    name: selectedInsurer.company_name,
    address: selectedInsurer.address,
    phone: selectedInsurer.phone,
    email: selectedInsurer.email,
    contactPerson: selectedInsurer.contact_person,
  } : undefined;

  const rows: Row[] = useMemo(() => {
    const from = Number(fromMonth), to = Number(toMonth);
    const out: Row[] = [];
    for (let m = from; m <= to; m++) {
      const monthClaims = claimRows.filter((claim) =>
        Number(claim.claim_year) === Number(year)
        && Number(claim.claim_month) === m
        && (insurerId === "all" || claim.insurance_company_id === insurerId));
      const monthlySettlements = settlementRows.filter((period) =>
        period.period_type === "month"
        && String(period.period_start || "").slice(0, 7) === `${year}-${String(m).padStart(2, "0")}`
        && (insurerId === "all" || period.insurance_company_id === insurerId));
      const monthlyTaxRows = taxRows.filter((tax) =>
        Number(tax.year) === Number(year)
        && Number(tax.month) === m
        && (insurerId === "all" || tax.insurance_company_id === insurerId));
      const settledInsurers = new Set(monthlySettlements.map((period) => period.insurance_company_id));
      const periodFigures = monthlySettlements.map((period) => {
        const companyClaims = monthClaims.filter((claim) => claim.insurance_company_id === period.insurance_company_id);
        const claimFallback = calculateClaimGrossTotals(companyClaims);
        const submittedGross = period.total_claims_submitted == null
          ? claimFallback.submittedGross
          : Number(period.total_claims_submitted || 0);
        const rejectedGross = period.rejection_amount == null
          ? claimFallback.rejectedGross
          : Number(period.rejection_amount || 0);
        const approvedGross = period.approved_gross_amount == null
          ? Math.max(submittedGross - rejectedGross, 0)
          : Number(period.approved_gross_amount || 0);
        const companyPayments = paymentRows.filter((payment) =>
          payment.insurance_company_id === period.insurance_company_id
          && Number(payment.claim_year) === Number(year)
          && Number(payment.claim_month) === m);
        const cashReceived = period.approved_gross_amount != null && period.payment_received != null
          ? Number(period.payment_received || 0)
          : companyPayments.reduce((sum: number, payment) => sum + Number(payment.amount_paid || 0), 0);
        const companyTaxRows = monthlyTaxRows.filter((tax) => tax.insurance_company_id === period.insurance_company_id);
        const hasConfirmedAdvice = ["payment_advice_received", "reconciled"].includes(period.settlement_status)
          && period.actual_withholding_tax != null;
        const confirmedWht = hasConfirmedAdvice
          ? Number(period.actual_withholding_tax || 0)
          : companyTaxRows.filter((tax) => tax.is_actual === true)
            .reduce((sum: number, tax) => sum + Number(tax.tax_amount || 0), 0);
        return { submittedGross, rejectedGross, approvedGross, cashReceived, confirmedWht };
      });
      const fallbackClaims = monthClaims.filter((claim) => !settledInsurers.has(claim.insurance_company_id));
      const fallbackTotals = calculateClaimGrossTotals(fallbackClaims);
      const fallbackPayments = paymentRows.filter((payment) =>
        Number(payment.claim_year) === Number(year)
        && Number(payment.claim_month) === m
        && (insurerId === "all" || payment.insurance_company_id === insurerId)
        && !settledInsurers.has(payment.insurance_company_id));
      const fallbackTax = monthlyTaxRows.filter((tax) =>
        !settledInsurers.has(tax.insurance_company_id) && tax.is_actual === true)
        .reduce((sum: number, tax) => sum + Number(tax.tax_amount || 0), 0);
      const fallbackPaid = fallbackPayments.reduce((sum: number, payment) => sum + Number(payment.amount_paid || 0), 0);
      const fallbackBalance = calculateClaimsScheduleBalance({
        submittedGross: fallbackTotals.submittedGross,
        rejectedGross: fallbackTotals.rejectedGross,
        cashReceived: fallbackPaid,
        confirmedWithholdingTax: fallbackTax,
      });
      const submitted = periodFigures.reduce((sum, figure) => sum + figure.submittedGross, 0) + fallbackTotals.submittedGross;
      const rejected = periodFigures.reduce((sum, figure) => sum + figure.rejectedGross, 0) + fallbackTotals.rejectedGross;
      const paid = periodFigures.reduce((sum, figure) => sum + figure.cashReceived, 0) + fallbackPaid;
      const wht = periodFigures.reduce((sum, figure) => sum + figure.confirmedWht, 0) + fallbackTax;
      const outstanding = periodFigures.reduce((sum, figure) => sum + calculateClaimsScheduleBalance({
        submittedGross: figure.submittedGross,
        rejectedGross: figure.rejectedGross,
        approvedGross: figure.approvedGross,
        cashReceived: figure.cashReceived,
        confirmedWithholdingTax: figure.confirmedWht,
      }).outstanding, 0) + fallbackBalance.outstanding;
      out.push({
        period: `${MONTHS[m - 1]} ${year}`,
        submitted,
        rejected,
        paid,
        withholdingTax: wht,
        outstanding,
        rejectionRate: submitted > 0 ? (rejected / submitted) * 100 : 0,
      });
    }
    return out;
  }, [claimRows, paymentRows, taxRows, settlementRows, insurerId, year, fromMonth, toMonth]);

  const totals = rows.reduce((acc, r) => ({
    withholdingTax: acc.withholdingTax + r.withholdingTax,
    submitted: acc.submitted + r.submitted,
    rejected: acc.rejected + r.rejected,
    paid: acc.paid + r.paid,
    outstanding: acc.outstanding + r.outstanding,
  }), { submitted: 0, rejected: 0, paid: 0, withholdingTax: 0, outstanding: 0 });
  const totalRate = totals.submitted + totals.rejected > 0 ? (totals.rejected / (totals.submitted + totals.rejected)) * 100 : 0;

  const title = `Claims Schedule - ${insurerName} (${MONTHS[Number(fromMonth) - 1]}-${MONTHS[Number(toMonth) - 1]} ${year})`;
  const columns = ["Claims Period", "Submitted (GH¢)", "Rejected (GH¢)", "Payments (GH¢)", "Withholding Tax (GH¢)", "Outstanding (GH¢)", "Rejection Rate"];

  const pdfBody = () => [
    ...rows.map((r) => [r.period, r.submitted.toLocaleString(), r.rejected.toLocaleString(), r.paid.toLocaleString(), r.withholdingTax.toLocaleString(), r.outstanding.toLocaleString(), `${r.rejectionRate.toFixed(1)}%`]),
    ["TOTAL", totals.submitted.toLocaleString(), totals.rejected.toLocaleString(), totals.paid.toLocaleString(), totals.withholdingTax.toLocaleString(), totals.outstanding.toLocaleString(), `${totalRate.toFixed(1)}%`],
  ];

  const excelRows = () => rows.map((r) => ({
    "Claims Period": r.period, Submitted: r.submitted, Rejected: r.rejected,
    Payments: r.paid, "Withholding Tax": r.withholdingTax, Outstanding: r.outstanding, "Rejection Rate (%)": Number(r.rejectionRate.toFixed(2)),
  }));

  const fmt = (n: number) => `GH¢ ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const previewPdf = async () => {
    const blob = await buildReportPDFBlob(title, pdfBody(), columns, companyInfo, insurerDocumentDetails);
    setPdfBlob(blob);
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" />Schedule Generator</h1>
        <p className="page-description">Build insurer claim schedules with period-level submitted, rejected, cash-paid and confirmed withholding-tax figures. Provisional WHT is excluded from settlement credits. Outstanding = Approved Gross − Payments − Confirmed WHT; approved gross defaults to Submitted − Rejected when no advice figure exists.</p>
      </div>

      <div className="stat-card grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>Insurance Company</Label>
          <select value={insurerId} onChange={(e) => setInsurerId(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All Insurance Companies</option>
            {(insurers || []).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}
          </select>
        </div>
        <div>
          <Label>Year</Label>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <Label>From Month</Label>
          <select value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <Label>To Month</Label>
          <select value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="md:col-span-4 flex flex-wrap gap-2">
          <Button onClick={() => setGenerated(true)} className="gap-2"><ClipboardList className="w-4 h-4" />Generate Schedule</Button>
          <Button variant="outline" disabled={!generated} onClick={() => void previewPdf()} className="gap-2"><FileDown className="w-4 h-4" />Preview PDF</Button>
          <Button variant="outline" disabled={!generated} onClick={() => exportReportExcel(title, excelRows(), "Schedule")} className="gap-2"><FileSpreadsheet className="w-4 h-4" />Export Excel</Button>
           
        </div>
      </div>

      {generated && (
        <div className="stat-card overflow-x-auto">
          <h3 className="font-heading font-semibold mb-1">{insurerName}</h3>
          <p className="text-xs text-muted-foreground mb-4">{MONTHS[Number(fromMonth) - 1]} – {MONTHS[Number(toMonth) - 1]} {year} · Outstanding = Approved Gross − Payments − Confirmed WHT · Rejection Rate = Rejected / Submitted × 100</p>
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period}>
                  <td className="font-medium">{r.period}</td>
                                     <td>{fmt(r.submitted)}</td>
                  <td className="text-destructive">{fmt(r.rejected)}</td>
                  <td className="text-success">{fmt(r.paid)}</td>
                  <td>{fmt(r.withholdingTax)}</td>
                  <td className="font-semibold">{fmt(r.outstanding)}</td>
                  <td>{r.rejectionRate.toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="bg-muted/50 font-bold">
                <td>TOTAL</td>
                                 <td>{fmt(totals.submitted)}</td>
                <td>{fmt(totals.rejected)}</td>
                <td>{fmt(totals.paid)}</td>
                <td>{fmt(totals.withholdingTax)}</td>
                <td>{fmt(totals.outstanding)}</td>
                <td>{totalRate.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <PdfPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} blob={pdfBlob} fileName={`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`} title={title} />
    </div>
  );
}