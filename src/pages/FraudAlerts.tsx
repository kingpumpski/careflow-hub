import { useMemo } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

export default function FraudAlerts() {
  const { data: preauths } = useSupabaseQuery("pre_authorizations");
  const { data: patients } = useSupabaseQuery("patients");
  const { data: doctors } = useSupabaseQuery("doctors");

  const alerts = useMemo(() => {
    const out: Array<{ severity: "high" | "medium"; type: string; detail: string }> = [];
    const items = preauths || [];

    // 1) Duplicate: same patient + diagnosis + procedure_date
    const seen = new Map<string, number>();
    items.forEach((p: any) => {
      const key = `${p.patient_id}-${p.diagnosis}-${p.procedure_date}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    });
    seen.forEach((count, key) => {
      if (count > 1) {
        const [pid, dx] = key.split("-");
        const pat = patients?.find((x: any) => x.id === pid);
        out.push({
          severity: "high",
          type: "Duplicate Request",
          detail: `${count}× identical requests for ${pat?.patient_name || "Unknown"} — ${dx || "n/a"}`,
        });
      }
    });

    // 2) Inflated charges (>3σ of cost per diagnosis)
    const byDx: Record<string, number[]> = {};
    items.forEach((p: any) => {
      const dx = p.diagnosis || "Unspecified";
      (byDx[dx] = byDx[dx] || []).push(Number(p.total_cost || 0));
    });
    Object.entries(byDx).forEach(([dx, costs]) => {
      if (costs.length < 4) return;
      const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
      const sd = Math.sqrt(costs.reduce((s, x) => s + (x - mean) ** 2, 0) / costs.length);
      items.filter((p: any) => (p.diagnosis || "Unspecified") === dx && Number(p.total_cost || 0) > mean + 3 * sd).forEach((p: any) => {
        const pat = patients?.find((x: any) => x.id === p.patient_id);
        out.push({
          severity: "medium",
          type: "Outlier Cost",
          detail: `GH¢ ${Number(p.total_cost).toLocaleString()} for ${pat?.patient_name || "Unknown"} — ${dx} (avg GH¢ ${mean.toFixed(0)})`,
        });
      });
    });

    // 3) High-frequency doctor: >5 requests/week
    const docCounts: Record<string, number> = {};
    items.forEach((p: any) => {
      const d = new Date(p.created_at);
      const week = `${d.getFullYear()}-W${Math.floor(d.getTime() / (7 * 86400000))}`;
      const key = `${p.doctor_id}-${week}`;
      docCounts[key] = (docCounts[key] || 0) + 1;
    });
    Object.entries(docCounts).forEach(([key, count]) => {
      if (count > 10) {
        const docId = key.split("-")[0];
        const doc = doctors?.find((x: any) => x.id === docId);
        out.push({
          severity: "medium",
          type: "High Frequency",
          detail: `${doc?.doctor_name || "Unknown"} submitted ${count} requests in one week`,
        });
      }
    });

    return out;
  }, [preauths, patients, doctors]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><ShieldAlert className="w-6 h-6" /> Fraud Alerts</h1>
        <p className="page-description">AI-assisted detection of duplicate requests, outlier costs, and unusual submission patterns.</p>
      </div>

      {alerts.length === 0 ? (
        <div className="stat-card text-center py-12 text-muted-foreground">
          <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-success/60" />
          <p className="font-medium">No anomalies detected</p>
          <p className="text-sm">All pre-authorization activity appears within normal ranges.</p>
        </div>
      ) : (
        <div className="stat-card">
          <table className="data-table">
            <thead><tr><th>Severity</th><th>Type</th><th>Detail</th></tr></thead>
            <tbody>
              {alerts.map((a, i) => (
                <tr key={i}>
                  <td>
                    <span className={`badge ${a.severity === "high" ? "badge-error" : "badge-warning"} flex items-center gap-1 w-fit`}>
                      <AlertTriangle className="w-3 h-3" /> {a.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="font-medium">{a.type}</td>
                  <td>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}