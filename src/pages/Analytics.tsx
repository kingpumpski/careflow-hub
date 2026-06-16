import { useMemo } from "react";
import { TrendingUp, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Analytics() {
  const { data: claims } = useSupabaseQuery("claims");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: wht } = useSupabaseQuery("withholding_tax");
  const { data: preauths } = useSupabaseQuery("pre_authorizations");
  const { data: items } = useSupabaseQuery("preauth_items");
  const { data: catalog } = useSupabaseQuery("preauth_catalog_items");
  const { data: ledger } = useSupabaseQuery("ledger_entries");

  // ---- Volume Analytics: monthly claim counts/amounts ----
  const volumeData = useMemo(() => {
    const m = monthNames.map((mn, i) => {
      const month = i + 1;
      const list = (claims || []).filter((c: any) => c.claim_month === month);
      return {
        month: mn,
        count: list.length,
        amount: list.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0),
      };
    });
    return m;
  }, [claims]);

  // ---- Turnaround: avg days submitted_at -> paid_at per insurer ----
  const turnaround = useMemo(() => {
    return (insurers || []).map((ins: any) => {
      const list = (claims || []).filter((c: any) =>
        c.insurance_company_id === ins.id && c.submitted_at && c.paid_at,
      );
      if (list.length === 0) return { company: ins.company_name, avgDays: 0, count: 0 };
      const total = list.reduce((s: number, c: any) => {
        return s + (new Date(c.paid_at).getTime() - new Date(c.submitted_at).getTime()) / 86400000;
      }, 0);
      return { company: ins.company_name, avgDays: total / list.length, count: list.length };
    }).filter((r: any) => r.count > 0).sort((a: any, b: any) => b.avgDays - a.avgDays);
  }, [claims, insurers]);

  // ---- Loss Ratio: rejected/submitted per insurer ----
  const lossRatio = useMemo(() => {
    return (insurers || []).map((ins: any) => {
      const list = (claims || []).filter((c: any) => c.insurance_company_id === ins.id);
      const submitted = list.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const rejected = list.filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const paid = (payments || []).filter((p: any) => p.insurance_company_id === ins.id).reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
      const ratio = submitted > 0 ? (rejected / submitted) * 100 : 0;
      const collectRate = submitted > 0 ? (paid / submitted) * 100 : 0;
      return { company: ins.company_name, submitted, paid, rejected, ratio, collectRate };
    }).filter((r: any) => r.submitted > 0).sort((a: any, b: any) => b.ratio - a.ratio);
  }, [claims, insurers, payments]);

  // ---- Revenue Leakage: rejected (not appealed) + unpaid balance ----
  const leakage = useMemo(() => {
    const rejectedNotAppealed = (claims || []).filter((c: any) =>
      c.status === "rejected" && (!c.appeal_status || c.appeal_status === "none"),
    );
    const rejAmount = rejectedNotAppealed.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);

    const totalSubmitted = (claims || []).filter((c: any) => c.status !== "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const totalPaid = (payments || []).reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    const totalTax = (wht || []).reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    const outstanding = totalSubmitted - totalPaid - totalTax;

    return {
      rejectedNotAppealed: rejAmount,
      rejectedCount: rejectedNotAppealed.length,
      outstanding,
      recoverable: rejAmount + Math.max(outstanding, 0),
    };
  }, [claims, payments, wht]);

  // ---- Disease Burden: by diagnosis from pre_authorizations ----
  const diseaseData = useMemo(() => {
    const map: Record<string, { count: number; cost: number }> = {};
    (preauths || []).forEach((p: any) => {
      const dx = p.diagnosis || "Unspecified";
      map[dx] = map[dx] || { count: 0, cost: 0 };
      map[dx].count += 1;
      map[dx].cost += Number(p.total_cost || 0);
    });
    return Object.entries(map).map(([dx, v]) => ({ diagnosis: dx, ...v }))
      .sort((a, b) => b.cost - a.cost).slice(0, 15);
  }, [preauths]);

  // ---- Insurer Profitability Scorecard ----
  const insurerScore = useMemo(() => {
    return (insurers || []).map((ins: any) => {
      const list = (claims || []).filter((c: any) => c.insurance_company_id === ins.id);
      const submitted = list.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const rejected = list.filter((c: any) => c.status === "rejected").reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const paid = (payments || []).filter((p: any) => p.insurance_company_id === ins.id).reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
      const tax = (wht || []).filter((t: any) => t.insurance_company_id === ins.id).reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
      const outstanding = (submitted - rejected) - paid - tax;
      const denialRate = submitted > 0 ? (rejected / submitted) * 100 : 0;

      // avg days to pay
      const paidList = list.filter((c: any) => c.submitted_at && c.paid_at);
      const avgDays = paidList.length
        ? paidList.reduce((s: number, c: any) => s + (new Date(c.paid_at).getTime() - new Date(c.submitted_at).getTime()) / 86400000, 0) / paidList.length
        : 0;

      let risk = "Low";
      if (denialRate > 20 || avgDays > 90) risk = "High";
      else if (denialRate > 10 || avgDays > 60) risk = "Medium";

      return { company: ins.company_name, submitted, paid, outstanding, denialRate, avgDays, risk };
    }).filter((r: any) => r.submitted > 0);
  }, [insurers, claims, payments, wht]);

  // ---- Service Line Profitability (preauth_items × catalog category) ----
  const serviceLine = useMemo(() => {
    const catMap = new Map((catalog || []).map((c: any) => [c.item_name, c.category || "Uncategorized"]));
    const map: Record<string, { revenue: number; count: number }> = {};
    (items || []).forEach((it: any) => {
      const cat = catMap.get(it.description) || "Other";
      map[cat] = map[cat] || { revenue: 0, count: 0 };
      map[cat].revenue += Number(it.amount || 0);
      map[cat].count += Number(it.quantity || 1);
    });
    return Object.entries(map).map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [items, catalog]);

  // ---- Revenue Forecast (linear regression on last 12 months from ledger) ----
  const forecast = useMemo(() => {
    const monthly: Record<string, number> = {};
    (ledger || []).filter((e: any) => e.account_credit === "Claims Revenue").forEach((e: any) => {
      const key = `${e.claim_year}-${String(e.claim_month).padStart(2, "0")}`;
      monthly[key] = (monthly[key] || 0) + Number(e.amount || 0);
    });
    const keys = Object.keys(monthly).sort();
    const last12 = keys.slice(-12);
    const series = last12.map((k, i) => ({ x: i, y: monthly[k], label: k }));

    // simple linear regression y = a + bx
    const n = series.length;
    if (n < 2) return { history: series, projection: [], slope: 0, avg: 0 };
    const sx = series.reduce((s, p) => s + p.x, 0);
    const sy = series.reduce((s, p) => s + p.y, 0);
    const sxy = series.reduce((s, p) => s + p.x * p.y, 0);
    const sxx = series.reduce((s, p) => s + p.x * p.x, 0);
    const b = (n * sxy - sx * sy) / Math.max(n * sxx - sx * sx, 1);
    const a = (sy - b * sx) / n;
    const projection = Array.from({ length: 3 }, (_, i) => ({
      label: `Month +${i + 1}`,
      y: Math.max(a + b * (n + i), 0),
    }));
    return { history: series, projection, slope: b, avg: sy / n };
  }, [ledger]);

  // ---- Board Report PDF ----
  const generateBoardReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Executive Board Report", 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);

    doc.setFontSize(14); doc.setTextColor(0);
    doc.text("1. Insurer Loss Ratio", 14, 42);
    autoTable(doc, {
      startY: 46,
      head: [["Insurer", "Submitted", "Paid", "Rejected", "Loss %"]],
      body: lossRatio.map((r: any) => [r.company, r.submitted.toLocaleString(), r.paid.toLocaleString(), r.rejected.toLocaleString(), `${r.ratio.toFixed(1)}%`]),
      theme: "grid", headStyles: { fillColor: [30, 64, 120] },
    });

    let y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14); doc.text("2. Insurer Risk Scorecard", 14, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Insurer", "Outstanding", "Denial %", "Avg Days", "Risk"]],
      body: insurerScore.map((r: any) => [r.company, r.outstanding.toLocaleString(), `${r.denialRate.toFixed(1)}%`, r.avgDays.toFixed(0), r.risk]),
      theme: "grid", headStyles: { fillColor: [30, 64, 120] },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14); doc.text("3. Revenue Leakage", 14, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Metric", "Amount (GH¢)"]],
      body: [
        ["Rejected, not appealed", leakage.rejectedNotAppealed.toLocaleString()],
        ["Outstanding receivables", Math.max(leakage.outstanding, 0).toLocaleString()],
        ["Total recoverable", leakage.recoverable.toLocaleString()],
      ],
      theme: "grid", headStyles: { fillColor: [30, 64, 120] },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14); doc.text("4. Top Disease Burden", 14, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Diagnosis", "Cases", "Total Cost (GH¢)"]],
      body: diseaseData.slice(0, 10).map((d) => [d.diagnosis, d.count, d.cost.toLocaleString()]),
      theme: "grid", headStyles: { fillColor: [30, 64, 120] },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(14); doc.text("5. Revenue Forecast (next 3 months)", 14, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Period", "Projected Revenue (GH¢)"]],
      body: forecast.projection.map((p) => [p.label, p.y.toLocaleString(undefined, { maximumFractionDigits: 0 })]),
      theme: "grid", headStyles: { fillColor: [30, 64, 120] },
    });

    doc.save(`board-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><TrendingUp className="w-6 h-6" /> Strategic Analytics</h1>
          <p className="page-description">Volume, turnaround, profitability, disease burden, forecasting, and executive reporting.</p>
        </div>
        <Button onClick={generateBoardReport} className="gap-2">
          <FileText className="w-4 h-4" /> Generate Board Report
        </Button>
      </div>

      <Tabs defaultValue="volume" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="volume">Volume</TabsTrigger>
          <TabsTrigger value="turnaround">Turnaround</TabsTrigger>
          <TabsTrigger value="loss">Loss Ratio</TabsTrigger>
          <TabsTrigger value="leakage">Revenue Leakage</TabsTrigger>
          <TabsTrigger value="disease">Disease Burden</TabsTrigger>
          <TabsTrigger value="insurer">Insurer Scorecard</TabsTrigger>
          <TabsTrigger value="service">Service Lines</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
        </TabsList>

        <TabsContent value="volume" className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Claims Volume by Month</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" /><YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" />
              <Tooltip /><Legend />
              <Bar yAxisId="left" dataKey="count" fill="hsl(210, 78%, 42%)" name="Claim Count" />
              <Bar yAxisId="right" dataKey="amount" fill="hsl(152, 60%, 42%)" name="Amount (GH¢)" />
            </BarChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="turnaround" className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Average Days to Payment per Insurer</h3>
          <table className="data-table">
            <thead><tr><th>Insurer</th><th>Paid Claims</th><th>Avg Days</th><th>Performance</th></tr></thead>
            <tbody>
              {turnaround.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="font-medium">{r.company}</td>
                  <td>{r.count}</td>
                  <td>{r.avgDays.toFixed(1)}</td>
                  <td>
                    <span className={`badge ${r.avgDays <= 30 ? "badge-success" : r.avgDays <= 60 ? "badge-warning" : "badge-error"}`}>
                      {r.avgDays <= 30 ? "Fast" : r.avgDays <= 60 ? "Moderate" : "Slow"}
                    </span>
                  </td>
                </tr>
              ))}
              {turnaround.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No paid claims with submission timestamps yet</td></tr>}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="loss" className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Loss Ratio & Collection Rate per Insurer</h3>
          <table className="data-table">
            <thead><tr><th>Insurer</th><th>Submitted</th><th>Rejected</th><th>Paid</th><th>Loss %</th><th>Collection %</th></tr></thead>
            <tbody>
              {lossRatio.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="font-medium">{r.company}</td>
                  <td>{r.submitted.toLocaleString()}</td>
                  <td className="text-destructive">{r.rejected.toLocaleString()}</td>
                  <td className="text-success">{r.paid.toLocaleString()}</td>
                  <td><span className={`badge ${r.ratio < 5 ? "badge-success" : r.ratio < 15 ? "badge-warning" : "badge-error"}`}>{r.ratio.toFixed(1)}%</span></td>
                  <td>{r.collectRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="leakage" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Rejected, not appealed</p>
            <p className="text-2xl font-bold text-destructive mt-2">GH¢ {leakage.rejectedNotAppealed.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{leakage.rejectedCount} claim(s)</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">Outstanding receivables</p>
            <p className="text-2xl font-bold text-warning mt-2">GH¢ {Math.max(leakage.outstanding, 0).toLocaleString()}</p>
          </div>
          <div className="stat-card border-2 border-primary/30">
            <p className="text-sm text-muted-foreground">Total recoverable</p>
            <p className="text-2xl font-bold text-primary mt-2">GH¢ {leakage.recoverable.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Pursue these for revenue recovery</p>
          </div>
        </TabsContent>

        <TabsContent value="disease" className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Top Diagnoses by Cost</h3>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={diseaseData} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" /><YAxis dataKey="diagnosis" type="category" width={120} />
              <Tooltip />
              <Bar dataKey="cost" fill="hsl(210, 78%, 42%)" name="Total Cost (GH¢)" />
            </BarChart>
          </ResponsiveContainer>
        </TabsContent>

        <TabsContent value="insurer" className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Insurer Profitability Scorecard</h3>
          <table className="data-table">
            <thead><tr><th>Insurer</th><th>Submitted</th><th>Paid</th><th>Outstanding</th><th>Denial %</th><th>Avg Days</th><th>Risk</th></tr></thead>
            <tbody>
              {insurerScore.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="font-medium">{r.company}</td>
                  <td>{r.submitted.toLocaleString()}</td>
                  <td className="text-success">{r.paid.toLocaleString()}</td>
                  <td className="text-warning">{r.outstanding.toLocaleString()}</td>
                  <td>{r.denialRate.toFixed(1)}%</td>
                  <td>{r.avgDays.toFixed(0)}</td>
                  <td><span className={`badge ${r.risk === "Low" ? "badge-success" : r.risk === "Medium" ? "badge-warning" : "badge-error"}`}>{r.risk}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="service" className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Service Line Revenue</h3>
          <table className="data-table">
            <thead><tr><th>Category</th><th>Units</th><th>Revenue (GH¢)</th></tr></thead>
            <tbody>
              {serviceLine.map((r, i) => (
                <tr key={i}><td className="font-medium">{r.category}</td><td>{r.count}</td><td className="font-semibold">{r.revenue.toLocaleString()}</td></tr>
              ))}
              {serviceLine.length === 0 && <tr><td colSpan={3} className="text-center py-6 text-muted-foreground">No pre-authorization items yet</td></tr>}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="forecast" className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Revenue Forecast (linear projection)</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Avg monthly revenue: GH¢ {forecast.avg.toLocaleString(undefined, { maximumFractionDigits: 0 })} · Trend: {forecast.slope >= 0 ? "📈" : "📉"} {forecast.slope.toFixed(0)}/mo
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={[...forecast.history.map((h: any) => ({ label: h.label, actual: h.y })), ...forecast.projection.map((p) => ({ label: p.label, forecast: p.y }))]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" /><YAxis /><Tooltip /><Legend />
              <Line type="monotone" dataKey="actual" stroke="hsl(210, 78%, 42%)" strokeWidth={2} />
              <Line type="monotone" dataKey="forecast" stroke="hsl(152, 60%, 42%)" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
          {forecast.projection.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              {forecast.projection.map((p, i) => (
                <div key={i} className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{p.label}</p>
                  <p className="text-lg font-bold text-primary">GH¢ {p.y.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}