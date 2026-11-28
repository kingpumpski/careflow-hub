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

export default function ScheduleGenerator() {
  const { can } = usePermissions();
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: claims } = useSupabaseQuery("claims");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const { data: settlementPeriods } = useSupabaseQuery("claims_settlement_periods");
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
      const monthClaims = (claims || []).filter((c: any) =>
        Number(c.claim_year) === Number(year) &&
        Number(c.claim_month) === m &&
        (insurerId === "all" || c.insurance_company_id === insurerId));
      const submitted = monthClaims.filter((c: any) => c.status !== "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const rejected = monthClaims.filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const paid = (payments || []).filter((p: any) =>
        Number(p.claim_year) === Number(year) &&
        Number(p.claim_month) === m &&
        (insurerId === "all" || p.insurance_company_id === insurerId))
        .reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
      const grossSubmitted = submitted + rejected;
      const monthlySettlements = (settlementPeriods || []).filter((period: any) =>
        period.period_type === "month"
        && String(period.period_start || "").slice(0, 7) === `${year}-${String(m).padStart(2, "0")}`
        && (insurerId === "all" || period.insurance_company_id === insurerId));
      const confirmedSettlementTax = monthlySettlements
        .filter((period: any) => ["payment_advice_received", "reconciled"].includes(period.settlement_status) && period.actual_withholding_tax != null)
        .reduce((sum: number, period: any) => sum + Number(period.actual_withholding_tax || 0), 0);
      const hasConfirmedSettlementTax = monthlySettlements.some((period: any) =>
        ["payment_advice_received", "reconciled"].includes(period.settlement_status) && period.actual_withholding_tax != null);
      const settlementProvisionalTax = monthlySettlements.reduce((sum: number, period: any) => sum + Number(period.provisional_withholding_tax || 0), 0);
      const monthlyTaxRows = (withholdingTax || []).filter((tax: any) =>
        Number(tax.year) === Number(year) && Number(tax.month) === m
        && (insurerId === "all" || tax.insurance_company_id === insurerId));
      const actualTaxRows = monthlyTaxRows.filter((tax: any) => tax.is_actual === true);
      const taxFallback = actualTaxRows.length
        ? actualTaxRows.reduce((sum: number, tax: any) => sum + Number(tax.tax_amount || 0), 0)
        : monthlyTaxRows.reduce((sum: number, tax: any) => sum + Number(tax.tax_amount || 0), 0);
      const wht = hasConfirmedSettlementTax ? confirmedSettlementTax
        : monthlySettlements.length ? settlementProvisionalTax : taxFallback;
      out.push({
        period: `${MONTHS[m - 1]} ${year}`,
        submitted,
        rejected,
        paid,
        withholdingTax: wht,
        outstanding: submitted - paid - wht,
        rejectionRate: grossSubmitted > 0 ? (rejected / grossSubmitted) * 100 : 0,
      });
    }
    return out;
  }, [claims, payments, withholdingTax, settlementPeriods, insurerId, year, fromMonth, toMonth]);

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
        <p className="page-description">Build insurer claim schedules with period-level submitted, rejected, cash-paid and withholding-tax figures. Outstanding = Submitted − Payments − WHT.</p>
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
          <p className="text-xs text-muted-foreground mb-4">{MONTHS[Number(fromMonth) - 1]} – {MONTHS[Number(toMonth) - 1]} {year} · Outstanding = Submitted − Payments − WHT · Rejection Rate = Rejected / Submitted × 100</p>
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