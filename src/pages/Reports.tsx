import { useState, useMemo } from "react";
import { BarChart3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { exportReportPDF, exportReportExcel } from "@/lib/exportUtils";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const periods = ["Monthly", "Quarterly", "Bi-Annual", "Annual", "Total"];

export default function Reports() {
  const [activePeriod, setActivePeriod] = useState("Monthly");
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));

  const { data: claims } = useSupabaseQuery("claims");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const { data: settings } = useSupabaseQuery("system_settings");

  const companyInfo = {
    provider_name: settings?.find?.((s: any) => s.key === "provider_name")?.value || "",
    provider_address: settings?.find?.((s: any) => s.key === "provider_address")?.value || "",
  };

  const reportData = useMemo(() => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);

    return (insurers || []).map((ins: any) => {
      let insClaims = (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status !== "rejected");
      let insRejected = (claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status === "rejected");
      let insPayments = (payments || []).filter((p: any) => p.insurance_company_id === ins.id);
      let insTax = (withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id);

      // Filter by period - FIXED: now also filters payments by date
      if (activePeriod === "Monthly") {
        insClaims = insClaims.filter((c: any) => c.claim_year === year && c.claim_month === month);
        insRejected = insRejected.filter((c: any) => c.claim_year === year && c.claim_month === month);
        insTax = insTax.filter((t: any) => t.year === year && t.month === month);
        insPayments = insPayments.filter((p: any) => {
          const d = new Date(p.payment_date);
          return d.getFullYear() === year && d.getMonth() + 1 === month;
        });
      } else if (activePeriod === "Quarterly") {
        const qStart = Math.floor((month - 1) / 3) * 3 + 1;
        insClaims = insClaims.filter((c: any) => c.claim_year === year && c.claim_month >= qStart && c.claim_month < qStart + 3);
        insRejected = insRejected.filter((c: any) => c.claim_year === year && c.claim_month >= qStart && c.claim_month < qStart + 3);
        insTax = insTax.filter((t: any) => t.year === year && t.month >= qStart && t.month < qStart + 3);
        insPayments = insPayments.filter((p: any) => {
          const d = new Date(p.payment_date);
          const pm = d.getMonth() + 1;
          return d.getFullYear() === year && pm >= qStart && pm < qStart + 3;
        });
      } else if (activePeriod === "Bi-Annual") {
        const half = month <= 6 ? [1, 6] : [7, 12];
        insClaims = insClaims.filter((c: any) => c.claim_year === year && c.claim_month >= half[0] && c.claim_month <= half[1]);
        insRejected = insRejected.filter((c: any) => c.claim_year === year && c.claim_month >= half[0] && c.claim_month <= half[1]);
        insTax = insTax.filter((t: any) => t.year === year && t.month >= half[0] && t.month <= half[1]);
        insPayments = insPayments.filter((p: any) => {
          const d = new Date(p.payment_date);
          const pm = d.getMonth() + 1;
          return d.getFullYear() === year && pm >= half[0] && pm <= half[1];
        });
      } else if (activePeriod === "Annual") {
        insClaims = insClaims.filter((c: any) => c.claim_year === year);
        insRejected = insRejected.filter((c: any) => c.claim_year === year);
        insTax = insTax.filter((t: any) => t.year === year);
        insPayments = insPayments.filter((p: any) => new Date(p.payment_date).getFullYear() === year);
      }

      const submitted = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const rejected = insRejected.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const paid = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
      const tax = insTax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
      const netClaim = submitted - rejected;
      const outstanding = netClaim - paid - tax;

      return { company: ins.company_name, submitted, rejected, netClaim, paid, tax, outstanding, color: ins.color };
    }).filter(r => r.submitted > 0 || r.paid > 0 || r.rejected > 0);
  }, [claims, insurers, payments, withholdingTax, activePeriod, selectedYear, selectedMonth]);

  const grandSubmitted = reportData.reduce((s, r) => s + r.submitted, 0);
  const grandRejected = reportData.reduce((s, r) => s + r.rejected, 0);
  const grandNet = reportData.reduce((s, r) => s + r.netClaim, 0);
  const grandPaid = reportData.reduce((s, r) => s + r.paid, 0);
  const grandTax = reportData.reduce((s, r) => s + r.tax, 0);
  const grandOutstanding = reportData.reduce((s, r) => s + r.outstanding, 0);

  const handleExportPDF = () => {
    const data = reportData.map(r => [r.company, `GH¢ ${r.submitted.toLocaleString()}`, `GH¢ ${r.rejected.toLocaleString()}`, `GH¢ ${r.netClaim.toLocaleString()}`, `GH¢ ${r.paid.toLocaleString()}`, `GH¢ ${r.tax.toLocaleString()}`, `GH¢ ${r.outstanding.toLocaleString()}`]);
    data.push(["Grand Total", `GH¢ ${grandSubmitted.toLocaleString()}`, `GH¢ ${grandRejected.toLocaleString()}`, `GH¢ ${grandNet.toLocaleString()}`, `GH¢ ${grandPaid.toLocaleString()}`, `GH¢ ${grandTax.toLocaleString()}`, `GH¢ ${grandOutstanding.toLocaleString()}`]);
    exportReportPDF(`${activePeriod} Account Balance Report`, data, ["Company", "Submitted", "Rejected", "Net Claim", "Paid", "WHT", "Outstanding"], companyInfo);
  };

  const handleExportExcel = () => {
    const rows = reportData.map(r => ({
      "Insurance Company": r.company,
      "Submitted (GH¢)": r.submitted,
      "Rejected (GH¢)": r.rejected,
      "Net Claim (GH¢)": r.netClaim,
      "Paid (GH¢)": r.paid,
      "WHT (GH¢)": r.tax,
      "Outstanding (GH¢)": r.outstanding,
    }));
    rows.push({ "Insurance Company": "Grand Total", "Submitted (GH¢)": grandSubmitted, "Rejected (GH¢)": grandRejected, "Net Claim (GH¢)": grandNet, "Paid (GH¢)": grandPaid, "WHT (GH¢)": grandTax, "Outstanding (GH¢)": grandOutstanding });
    exportReportExcel(`${activePeriod} Report`, rows, "Report");
  };

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-description">Generate account balance and reconciliation reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportPDF}><Download className="w-4 h-4" />PDF</Button>
          <Button variant="outline" className="gap-2" onClick={handleExportExcel}><Download className="w-4 h-4" />Excel</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {periods.map((p) => (
          <Button key={p} variant={p === activePeriod ? "default" : "outline"} size="sm" onClick={() => setActivePeriod(p)}>
            {p}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {activePeriod !== "Total" && (
          <div className="flex items-center gap-2">
            <Label className="text-xs">Year:</Label>
            <Input type="number" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-24 h-8" />
          </div>
        )}
        {(activePeriod === "Monthly" || activePeriod === "Quarterly" || activePeriod === "Bi-Annual") && (
          <div className="flex items-center gap-2">
            <Label className="text-xs">Month:</Label>
            <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              {monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading">GH¢ {grandSubmitted.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Submitted</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-success">GH¢ {grandPaid.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Paid</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-warning">GH¢ {grandTax.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Total WHT</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-destructive">GH¢ {grandOutstanding.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Outstanding</p>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-heading font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          {activePeriod} Account Balance Report {activePeriod !== "Total" ? `— ${selectedYear}` : ""}
        </h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>Insurance Company</th><th>Submitted</th><th>Rejected</th><th>Net Claim</th><th>Paid</th><th>WHT</th><th>Outstanding</th></tr>
            </thead>
            <tbody>
              {reportData.map((r) => (
                <tr key={r.company} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#3b82f6" }} />
                      {r.company}
                    </div>
                  </td>
                  <td>GH¢ {r.submitted.toLocaleString()}</td>
                  <td className="text-destructive">GH¢ {r.rejected.toLocaleString()}</td>
                  <td className="font-medium">GH¢ {r.netClaim.toLocaleString()}</td>
                  <td className="text-success">GH¢ {r.paid.toLocaleString()}</td>
                  <td className="text-warning">GH¢ {r.tax.toLocaleString()}</td>
                  <td className="text-destructive font-semibold">GH¢ {r.outstanding.toLocaleString()}</td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No data for selected period</td></tr>
              )}
            </tbody>
            {reportData.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-muted/30">
                  <td>Grand Total</td>
                  <td>GH¢ {grandSubmitted.toLocaleString()}</td>
                  <td className="text-destructive">GH¢ {grandRejected.toLocaleString()}</td>
                  <td>GH¢ {grandNet.toLocaleString()}</td>
                  <td className="text-success">GH¢ {grandPaid.toLocaleString()}</td>
                  <td className="text-warning">GH¢ {grandTax.toLocaleString()}</td>
                  <td className="text-destructive">GH¢ {grandOutstanding.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
