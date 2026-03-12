import { Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const mockProcedures = [
  { id: 1, code: "MRI-001", name: "MRI Scan (Brain)", tariff: 3600, category: "Radiology" },
  { id: 2, code: "CT-001", name: "CT Scan (Full Body)", tariff: 2800, category: "Radiology" },
  { id: 3, code: "XR-001", name: "X-Ray (Chest)", tariff: 500, category: "Radiology" },
  { id: 4, code: "LAB-001", name: "Complete Blood Count", tariff: 150, category: "Laboratory" },
  { id: 5, code: "LAB-002", name: "Liver Function Test", tariff: 350, category: "Laboratory" },
  { id: 6, code: "SUR-001", name: "Appendectomy", tariff: 12500, category: "Surgery" },
  { id: 7, code: "CON-001", name: "General Consultation", tariff: 200, category: "Consultation" },
  { id: 8, code: "DEN-001", name: "Dental Filling", tariff: 800, category: "Dental" },
];

const categoryColors: Record<string, string> = {
  Radiology: "bg-info/10 text-info",
  Laboratory: "bg-accent/10 text-accent",
  Surgery: "bg-destructive/10 text-destructive",
  Consultation: "bg-primary/10 text-primary",
  Dental: "bg-warning/10 text-warning",
};

export default function Procedures() {
  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Procedure Tariffs</h1>
          <p className="page-description">Manage medical procedures and their standard tariffs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2"><Upload className="w-4 h-4" />Import Excel</Button>
          <Button className="gap-2"><Plus className="w-4 h-4" />Add Procedure</Button>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search procedures..." className="pl-10 h-9" />
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Procedure Name</th>
              <th>Category</th>
              <th>Tariff (GH¢)</th>
            </tr>
          </thead>
          <tbody>
            {mockProcedures.map((p) => (
              <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                <td className="font-mono text-xs font-medium">{p.code}</td>
                <td className="font-medium">{p.name}</td>
                <td>
                  <Badge variant="secondary" className={categoryColors[p.category] || ""}>
                    {p.category}
                  </Badge>
                </td>
                <td className="font-semibold">{p.tariff.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
