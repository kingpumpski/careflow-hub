import { useState, useMemo } from "react";
import { BarChart3, Download, Printer, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { exportReportPDF, exportReportExcel } from "@/lib/exportUtils";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const periods = ["Monthly", "Quarterly", "Bi-Annual", "Annual", "Total"];

export default function Reports() {
  const [activePeriod, setActivePeriod] = useState("Monthly");
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [activeReport, setActiveReport] = useState("balance");

  const { data: claims } = useSupabaseQuery("claims");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax } = useSupabaseQuery("withholding_tax");
  const { data: ledger } = useSupabaseQuery("ledger_entries");
  const { data: settings } = useSupabaseQuery("system_settings");

  const companyInfo = {
    provider_name: settings?.find?.((s: any) => s.key === "provider_name")?.value || "",
    provider_address: settings?.find?.((s: any) => s.key === "provider_address")?.value || "",
  };

  const filterByPeriod = (items: any[], yearKey: string, monthKey: string, dateKey?: string) => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);
    let filtered = items;
    if (activePeriod === "Monthly") {
      filtered = items.filter((i: any) => dateKey ? (new Date(i[dateKey]).getFullYear() === year && new Date(i[dateKey]).getMonth() + 1 === month) : (i[yearKey] === year && i[monthKey] === month));
    } else if (activePeriod === "Quarterly") {
      const qStart = Math.floor((month - 1) / 3) * 3 + 1;
      filtered = items.filter((i: any) => dateKey ? (new Date(i[dateKey]).getFullYear() === year && new Date(i[dateKey]).getMonth() + 1 >= qStart && new Date(i[dateKey]).getMonth() + 1 < qStart + 3) : (i[yearKey] === year && i[monthKey] >= qStart && i[monthKey] < qStart + 3));
    } else if (activePeriod === "Annual") {
      filtered = items.filter((i: any) => dateKey ? (new Date(i[dateKey]).getFullYear() === year) : (i[yearKey] === year));
    } else if (activePeriod === "Bi-Annual") {
      const half = month <= 6 ? [1, 6] : [7, 12];
      filtered = items.filter((i: any) => dateKey ? (new Date(i[dateKey]).getFullYear() === year && new Date(i[dateKey]).getMonth() + 1 >= half[0] && new Date(i[dateKey]).getMonth() + 1 <= half[1]) : (i[yearKey] === year && i[monthKey] >= half[0] && i[monthKey] <= half[1]));
    }
    return filtered;
  };

  const reportData = useMemo(() => {
    return (insurers || []).map((ins: any) => {
      const insClaims = filterByPeriod((claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status !== "rejected"), "claim_year", "claim_month");
      const insRejected = filterByPeriod((claims || []).filter((c: any) => c.insurance_company_id === ins.id && c.status === "rejected"), "claim_year", "claim_month");
      const insPayments = filterByPeriod((payments || []).filter((p: any) => p.insurance_company_id === ins.id), "claim_year", "claim_month");
      const insTax = filterByPeriod((withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id), "year", "month");

      const submitted = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const rejected = insRejected.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const paid = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
      const tax = insTax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
      const netClaim = submitted - rejected;
      const outstanding = netClaim - paid - tax;
      return { company: ins.company_name, submitted, rejected, netClaim, paid, tax, outstanding, color: ins.color };
    }).filter(r => r.submitted > 0 || r.paid > 0 || r.rejected > 0);
  }, [claims, insurers, payments, withholdingTax, activePeriod, selectedYear, selectedMonth]);

  // Ledger-based reports
  const incomeData = useMemo(() => {
    const filteredLedger = filterByPeriod(ledger || [], "claim_year", "claim_month");
    const revenue = filteredLedger.filter((e: any) => e.account_credit === "Claims Revenue").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const revAdj = filteredLedger.filter((e: any) => e.account_debit === "Revenue Adjustment").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const whtExp = filteredLedger.filter((e: any) => e.account_debit === "WHT Expense").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    return { revenue, revAdj, whtExp, netRevenue: revenue - revAdj, netIncome: revenue - revAdj - whtExp };
  }, [ledger, activePeriod, selectedYear, selectedMonth]);

  const taxLiabilityData = useMemo(() => {
    const filteredLedger = filterByPeriod(ledger || [], "claim_year", "claim_month");
    const whtPayable = filteredLedger.filter((e: any) => e.account_credit === "WHT Payable").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const whtReversals = filteredLedger.filter((e: any) => e.account_debit === "WHT Payable").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    return { whtPayable, whtReversals, netLiability: whtPayable - whtReversals };
  }, [ledger, activePeriod, selectedYear, selectedMonth]);

  const { sorted: sortedReport, sort, handleSort } = useSort(reportData);

  const grandSubmitted = reportData.reduce((s, r) => s + r.submitted, 0);
  const grandRejected = reportData.reduce((s, r) => s + r.rejected, 0);
  const grandNet = reportData.reduce((s, r) => s + r.netClaim, 0);
  const grandPaid = reportData.reduce((s, r) => s + r.paid, 0);
  const grandTax = reportData.reduce((s, r) => s + r.tax, 0);
  const grandOutstanding = reportData.reduce((s, r) => s + r.outstanding, 0);

  const handlePrint = (title: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const content = document.getElementById("report-content");
    printWindow.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#1e4078;color:#fff}tfoot td{background:#f0f0f0;font-weight:bold}.text-right{text-align:right}h1{color:#1e4078}h2{color:#333;margin-top:24px}.stat{display:inline-block;margin:8px 16px;text-align:center}.stat-value{font-size:24px;font-weight:bold}.stat-label{color:#666;font-size:12px}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>${content?.innerHTML || ""}</body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const handleExportPDF = () => {
    const data = sortedReport.map(r => [r.company, `GH¢ ${r.submitted.toLocaleString()}`, `GH¢ ${r.rejected.toLocaleString()}`, `GH¢ ${r.netClaim.toLocaleString()}`, `GH¢ ${r.paid.toLocaleString()}`, `GH¢ ${r.tax.toLocaleString()}`, `GH¢ ${r.outstanding.toLocaleString()}`]);
    data.push(["Grand Total", `GH¢ ${grandSubmitted.toLocaleString()}`, `GH¢ ${grandRejected.toLocaleString()}`, `GH¢ ${grandNet.toLocaleString()}`, `GH¢ ${grandPaid.toLocaleString()}`, `GH¢ ${grandTax.toLocaleString()}`, `GH¢ ${grandOutstanding.toLocaleString()}`]);
    exportReportPDF(`${activePeriod} ${activeReport === "balance" ? "Account Balance" : activeReport === "income" ? "Income Statement" : activeReport === "receivables" ? "Outstanding Receivables" : "Tax Liability"} Report`, data, ["Company", "Submitted", "Rejected", "Net Claim", "Paid", "WHT", "Outstanding"], companyInfo);
  };

  const handleExportExcel = () => {
    const rows = sortedReport.map(r => ({ "Insurance Company": r.company, "Submitted": r.submitted, "Rejected": r.rejected, "Net Claim": r.netClaim, "Paid": r.paid, "WHT": r.tax, "Outstanding": r.outstanding }));
    exportReportExcel(`${activePeriod} Report`, rows, "Report");
  };

  const periodLabel = activePeriod === "Total" ? "All Time" : `${activePeriod} — ${selectedYear}${activePeriod === "Monthly" ? ` ${monthNames[parseInt(selectedMonth)]}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div><h1 className="page-title flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" />Financial Reports</h1><p className="page-description">Generate comprehensive financial statements and reconciliation reports</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrint(periodLabel)}><Printer className="w-4 h-4" />Print</Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportPDF}><Download className="w-4 h-4" />PDF</Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportExcel}><Download className="w-4 h-4" />Excel</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {periods.map((p) => <Button key={p} variant={p === activePeriod ? "default" : "outline"} size="sm" onClick={() => setActivePeriod(p)}>{p}</Button>)}
      </div>
      <div className="flex items-center gap-3">
        {activePeriod !== "Total" && <div className="flex items-center gap-2"><Label className="text-xs">Year:</Label><Input type="number" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-24 h-8" /></div>}
        {(activePeriod === "Monthly" || activePeriod === "Quarterly" || activePeriod === "Bi-Annual") && (
          <div className="flex items-center gap-2"><Label className="text-xs">Month:</Label><select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>{monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div>
        )}
      </div>

      <Tabs value={activeReport} onValueChange={setActiveReport}>
        <TabsList>
          <TabsTrigger value="balance">Account Balance</TabsTrigger>
          <TabsTrigger value="income">Income Statement</TabsTrigger>
          <TabsTrigger value="receivables">Outstanding Receivables</TabsTrigger>
          <TabsTrigger value="tax">Tax Liability</TabsTrigger>
        </TabsList>

        <div id="report-content" className="mt-4">
          <TabsContent value="balance">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="stat-card text-center"><p className="text-2xl font-bold font-heading">GH¢ {grandSubmitted.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Submitted</p></div>
              <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-success">GH¢ {grandPaid.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Paid</p></div>
              <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-warning">GH¢ {grandTax.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT</p></div>
              <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-destructive">GH¢ {grandOutstanding.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Outstanding</p></div>
            </div>
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-4">{periodLabel} — Account Balance Report</h3>
              <table className="data-table">
                <thead><tr>
                  <SortableHeader label="Company" sortKey="company" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Submitted" sortKey="submitted" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Rejected" sortKey="rejected" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Net Claim" sortKey="netClaim" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Paid" sortKey="paid" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="WHT" sortKey="tax" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Outstanding" sortKey="outstanding" currentSort={sort} onSort={handleSort} />
                </tr></thead>
                <tbody>
                  {sortedReport.map((r) => (
                    <tr key={r.company} className="hover:bg-muted/50 transition-colors">
                      <td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#3b82f6" }} />{r.company}</div></td>
                      <td>GH¢ {r.submitted.toLocaleString()}</td>
                      <td className="text-destructive">GH¢ {r.rejected.toLocaleString()}</td>
                      <td className="font-medium">GH¢ {r.netClaim.toLocaleString()}</td>
                      <td className="text-success">GH¢ {r.paid.toLocaleString()}</td>
                      <td className="text-warning">GH¢ {r.tax.toLocaleString()}</td>
                      <td className="text-destructive font-semibold">GH¢ {r.outstanding.toLocaleString()}</td>
                    </tr>
                  ))}
                  {sortedReport.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No data for selected period</td></tr>}
                </tbody>
                {sortedReport.length > 0 && (
                  <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>GH¢ {grandSubmitted.toLocaleString()}</td><td className="text-destructive">GH¢ {grandRejected.toLocaleString()}</td><td>GH¢ {grandNet.toLocaleString()}</td><td className="text-success">GH¢ {grandPaid.toLocaleString()}</td><td className="text-warning">GH¢ {grandTax.toLocaleString()}</td><td className="text-destructive">GH¢ {grandOutstanding.toLocaleString()}</td></tr></tfoot>
                )}
              </table>
            </div>
          </TabsContent>

          <TabsContent value="income">
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />{periodLabel} — Income Statement</h3>
              <table className="data-table">
                <tbody>
                  <tr className="bg-muted/20"><td colSpan={2} className="font-bold">Revenue</td></tr>
                  <tr><td className="pl-8">Claims Revenue</td><td className="text-right font-semibold">GH¢ {incomeData.revenue.toLocaleString()}</td></tr>
                  <tr><td className="pl-8 text-destructive">Less: Revenue Adjustments (Rejections)</td><td className="text-right text-destructive">(GH¢ {incomeData.revAdj.toLocaleString()})</td></tr>
                  <tr className="font-bold border-t"><td className="pl-4">Net Revenue</td><td className="text-right">GH¢ {incomeData.netRevenue.toLocaleString()}</td></tr>
                  <tr><td colSpan={2}>&nbsp;</td></tr>
                  <tr className="bg-muted/20"><td colSpan={2} className="font-bold">Expenses</td></tr>
                  <tr><td className="pl-8 text-warning">Withholding Tax Expense</td><td className="text-right text-warning">GH¢ {incomeData.whtExp.toLocaleString()}</td></tr>
                  <tr><td colSpan={2}>&nbsp;</td></tr>
                  <tr className="font-bold text-lg border-t-2 bg-success/5"><td>Net Income</td><td className="text-right text-success">GH¢ {incomeData.netIncome.toLocaleString()}</td></tr>
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="receivables">
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-4">{periodLabel} — Outstanding Receivables Report</h3>
              <table className="data-table">
                <thead><tr><th>Company</th><th>Net Claim</th><th>Paid</th><th>WHT</th><th>Outstanding</th><th>% Collected</th></tr></thead>
                <tbody>
                  {sortedReport.filter(r => r.outstanding > 0).map((r) => (
                    <tr key={r.company} className="hover:bg-muted/50 transition-colors">
                      <td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#3b82f6" }} />{r.company}</div></td>
                      <td>GH¢ {r.netClaim.toLocaleString()}</td>
                      <td className="text-success">GH¢ {r.paid.toLocaleString()}</td>
                      <td className="text-warning">GH¢ {r.tax.toLocaleString()}</td>
                      <td className="text-destructive font-bold">GH¢ {r.outstanding.toLocaleString()}</td>
                      <td>{r.netClaim > 0 ? `${(((r.paid + r.tax) / r.netClaim) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                  {sortedReport.filter(r => r.outstanding > 0).length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No outstanding receivables</td></tr>}
                </tbody>
                {sortedReport.filter(r => r.outstanding > 0).length > 0 && (
                  <tfoot><tr className="font-bold bg-muted/30"><td>Total</td><td>GH¢ {grandNet.toLocaleString()}</td><td className="text-success">GH¢ {grandPaid.toLocaleString()}</td><td className="text-warning">GH¢ {grandTax.toLocaleString()}</td><td className="text-destructive">GH¢ {grandOutstanding.toLocaleString()}</td><td>{grandNet > 0 ? `${(((grandPaid + grandTax) / grandNet) * 100).toFixed(1)}%` : "—"}</td></tr></tfoot>
                )}
              </table>
            </div>
          </TabsContent>

          <TabsContent value="tax">
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-4">{periodLabel} — Tax Liability Report</h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-warning">GH¢ {taxLiabilityData.whtPayable.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT Payable</p></div>
                <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-success">GH¢ {taxLiabilityData.whtReversals.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT Reversals</p></div>
                <div className="stat-card text-center"><p className="text-2xl font-bold font-heading">GH¢ {taxLiabilityData.netLiability.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Net Tax Liability</p></div>
              </div>
              <table className="data-table">
                <thead><tr><th>Company</th><th>Claims Base</th><th>WHT Rate</th><th>WHT Amount</th></tr></thead>
                <tbody>
                  {sortedReport.filter(r => r.tax > 0).map((r) => (
                    <tr key={r.company} className="hover:bg-muted/50 transition-colors">
                      <td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#3b82f6" }} />{r.company}</div></td>
                      <td>GH¢ {r.netClaim.toLocaleString()}</td>
                      <td>5%</td>
                      <td className="font-semibold text-warning">GH¢ {r.tax.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {sortedReport.filter(r => r.tax > 0).length > 0 && (
                  <tfoot><tr className="font-bold bg-muted/30"><td>Total</td><td>GH¢ {grandNet.toLocaleString()}</td><td></td><td className="text-warning">GH¢ {grandTax.toLocaleString()}</td></tr></tfoot>
                )}
              </table>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
