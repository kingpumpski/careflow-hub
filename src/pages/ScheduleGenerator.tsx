import { useMemo, useState } from "react";
import { ClipboardList, FileDown, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { buildLetterheadConfig } from "@/lib/letterhead";
import { exportReportPDF, exportReportExcel } from "@/lib/exportUtils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Row {
  period: string;
  claimsCount: number;
  submitted: number;
  rejected: number;
  paid: number;
  outstanding: number;
  rejectionRate: number;
}

export default function ScheduleGenerator() {
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: claims } = useSupabaseQuery("claims");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: settings } = useSupabaseQuery("system_settings");

  const currentYear = new Date().getFullYear();
  const [insurerId, setInsurerId] = useState("all");
  const [year, setYear] = useState(String(currentYear));
  const [fromMonth, setFromMonth] = useState("1");
  const [toMonth, setToMonth] = useState("12");
  const [generated, setGenerated] = useState(false);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    (claims || []).forEach((c: any) => c.claim_year && set.add(Number(c.claim_year)));
    return Array.from(set).sort((a, b) => b - a);
  }, [claims, currentYear]);

  const companyInfo = useMemo(
    () => buildLetterheadConfig((k: string) => (settings || []).find((s: any) => s.key === k)?.value || ""),
    [settings]
  );

  const insurerName = insurerId === "all"
    ? "All Insurance Companies"
    : (insurers || []).find((i: any) => i.id === insurerId)?.company_name || "";

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
      out.push({
        period: `${MONTHS[m - 1]} ${year}`,
        claimsCount: monthClaims.length,
        submitted,
        rejected,
        paid,
        outstanding: submitted - paid,
        rejectionRate: grossSubmitted > 0 ? (rejected / grossSubmitted) * 100 : 0,
      });
    }
    return out;
  }, [claims, payments, insurerId, year, fromMonth, toMonth]);

  const totals = rows.reduce((acc, r) => ({
    claimsCount: acc.claimsCount + r.claimsCount,
    submitted: acc.submitted + r.submitted,
    rejected: acc.rejected + r.rejected,
    paid: acc.paid + r.paid,
    outstanding: acc.outstanding + r.outstanding,
  }), { claimsCount: 0, submitted: 0, rejected: 0, paid: 0, outstanding: 0 });
  const totalRate = totals.submitted + totals.rejected > 0 ? (totals.rejected / (totals.submitted + totals.rejected)) * 100 : 0;

  const title = `Claims Schedule - ${insurerName} (${MONTHS[Number(fromMonth) - 1]}-${MONTHS[Number(toMonth) - 1]} ${year})`;
  const columns = ["Period", "Claims", "Submitted (GH¢)", "Rejected (GH¢)", "Payments (GH¢)", "Outstanding (GH¢)", "Rejection Rate"];

  const pdfBody = () => [
    ...rows.map((r) => [r.period, String(r.claimsCount), r.submitted.toLocaleString(), r.rejected.toLocaleString(), r.paid.toLocaleString(), r.outstanding.toLocaleString(), `${r.rejectionRate.toFixed(1)}%`]),
    ["TOTAL", String(totals.claimsCount), totals.submitted.toLocaleString(), totals.rejected.toLocaleString(), totals.paid.toLocaleString(), totals.outstanding.toLocaleString(), `${totalRate.toFixed(1)}%`],
  ];

  const excelRows = () => rows.map((r) => ({
    Period: r.period, Claims: r.claimsCount, Submitted: r.submitted, Rejected: r.rejected,
    Payments: r.paid, Outstanding: r.outstanding, "Rejection Rate (%)": Number(r.rejectionRate.toFixed(2)),
  }));

  const fmt = (n: number) => `GH¢ ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" />Schedule Generator</h1>
        <p className="page-description">Build insurer claim schedules with automatic outstanding and rejection-rate computation.</p>
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
          <Button variant="outline" disabled={!generated} onClick={() => exportReportPDF(title, pdfBody(), columns, companyInfo)} className="gap-2"><FileDown className="w-4 h-4" />Export PDF</Button>
          <Button variant="outline" disabled={!generated} onClick={() => exportReportExcel(title, excelRows(), "Schedule")} className="gap-2"><FileSpreadsheet className="w-4 h-4" />Export Excel</Button>
          <Button variant="outline" disabled={!generated} onClick={() => window.print()} className="gap-2"><Printer className="w-4 h-4" />Print</Button>
        </div>
      </div>

      {generated && (
        <div className="stat-card overflow-x-auto">
          <h3 className="font-heading font-semibold mb-1">{insurerName}</h3>
          <p className="text-xs text-muted-foreground mb-4">{MONTHS[Number(fromMonth) - 1]} – {MONTHS[Number(toMonth) - 1]} {year} · Outstanding = Submitted − Payments · Rejection Rate = Rejected / Submitted × 100</p>
          <table className="data-table min-w-[840px]">
            <thead>
              <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period}>
                  <td className="font-medium">{r.period}</td>
                  <td>{r.claimsCount}</td>
                  <td>{fmt(r.submitted)}</td>
                  <td className="text-destructive">{fmt(r.rejected)}</td>
                  <td className="text-success">{fmt(r.paid)}</td>
                  <td className="font-semibold">{fmt(r.outstanding)}</td>
                  <td>{r.rejectionRate.toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="bg-muted/50 font-bold">
                <td>TOTAL</td>
                <td>{totals.claimsCount}</td>
                <td>{fmt(totals.submitted)}</td>
                <td>{fmt(totals.rejected)}</td>
                <td>{fmt(totals.paid)}</td>
                <td>{fmt(totals.outstanding)}</td>
                <td>{totalRate.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}