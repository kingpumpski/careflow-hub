import { BarChart3, Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const reports = [
  { name: "Claims Value Schedule (Annual)", description: "Total monetary value of claims per insurer per month", type: "Value" },
  { name: "Claims Volume Schedule (Annual)", description: "Number of claims submitted per insurer per month", type: "Volume" },
  { name: "Payment Analysis Report", description: "Breakdown of payments received vs outstanding", type: "Payment" },
  { name: "Insurance Performance Report", description: "Ranking insurers by payment speed and volume", type: "Analytics" },
  { name: "Withholding Tax Summary", description: "Monthly withholding tax breakdown by insurer", type: "Tax" },
  { name: "Defaulting Insurers Report", description: "Insurers with unpaid claims older than 60 days", type: "Compliance" },
];

const periods = ["Monthly", "Quarterly", "Bi-Annual", "Annual"];

export default function Reports() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-description">Generate and download operational reports</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {periods.map((p) => (
          <Button key={p} variant={p === "Monthly" ? "default" : "outline"} size="sm">
            {p}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((r) => (
          <div key={r.name} className="stat-card flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-sm">{r.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                <Badge variant="secondary" className="mt-2 text-[10px]">{r.type}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
