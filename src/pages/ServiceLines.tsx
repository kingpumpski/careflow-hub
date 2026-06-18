import { useMemo } from "react";
import { Layers } from "lucide-react";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export default function ServiceLines() {
  const { data: items } = useSupabaseQuery("preauth_items");
  const { data: catalog } = useSupabaseQuery("preauth_catalog_items");
  const { data: procedures } = useSupabaseQuery("procedures");

  // Categorize each preauth_item by matching its description to catalog/procedure category
  const rows = useMemo(() => {
    const catByName = new Map<string, string>();
    (catalog || []).forEach((c: any) => catByName.set(c.item_name?.toLowerCase().trim(), c.category || "Other"));
    (procedures || []).forEach((p: any) => catByName.set(p.procedure_name?.toLowerCase().trim(), p.category || "Other"));

    const byCat: Record<string, { count: number; revenue: number; qty: number }> = {};
    (items || []).forEach((it: any) => {
      const key = (it.description || "").toLowerCase().trim();
      let cat = catByName.get(key) || "Other";
      // Heuristic fallback
      if (cat === "Other") {
        if (/lab|test|blood|urine|culture/i.test(key)) cat = "Laboratory";
        else if (/x-?ray|scan|mri|ct|ultrasound|imaging/i.test(key)) cat = "Imaging";
        else if (/drug|tablet|capsule|injection|syrup|pharm/i.test(key)) cat = "Pharmacy";
        else if (/surger|operation|theatre/i.test(key)) cat = "Surgical";
        else if (/consult|opd|review/i.test(key)) cat = "Consultation";
        else if (/ward|bed|admission|ipd/i.test(key)) cat = "Inpatient";
      }
      const entry = byCat[cat] || { count: 0, revenue: 0, qty: 0 };
      entry.count += 1;
      entry.qty += Number(it.quantity || 1);
      entry.revenue += Number(it.amount || 0);
      byCat[cat] = entry;
    });

    const total = Object.values(byCat).reduce((s, e) => s + e.revenue, 0);
    return Object.entries(byCat).map(([category, e]) => ({
      category,
      count: e.count,
      qty: e.qty,
      revenue: e.revenue,
      avgPrice: e.qty > 0 ? e.revenue / e.qty : 0,
      share: total > 0 ? (e.revenue / total) * 100 : 0,
    }));
  }, [items, catalog, procedures]);

  const { sorted, sort, handleSort } = useSort(rows, "revenue");

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Layers className="w-6 h-6" /> Service Line Profitability</h1>
        <p className="page-description">Revenue by service category — Laboratory, Imaging, Pharmacy, Surgical, Consultation, Inpatient, and more.</p>
      </div>

      <div className="stat-card">
        <h3 className="font-semibold mb-4">Revenue by Service Line (GH¢)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={sorted}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="category" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Legend />
            <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="stat-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortableHeader label="Service Line" sortKey="category" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Line Items" sortKey="count" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Total Qty" sortKey="qty" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Revenue (GH¢)" sortKey="revenue" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Avg Unit Price" sortKey="avgPrice" currentSort={sort} onSort={handleSort} />
              <SortableHeader label="Share %" sortKey="share" currentSort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r: any, i: number) => (
              <tr key={i}>
                <td className="font-medium">{r.category}</td>
                <td>{r.count}</td>
                <td>{r.qty}</td>
                <td className="font-semibold">{r.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.avgPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td><span className="badge badge-info">{r.share.toFixed(1)}%</span></td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No service line data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}