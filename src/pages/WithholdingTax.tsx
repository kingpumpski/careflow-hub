import { Calculator, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const mockTax = [
  { id: 1, insurance: "ACACIA Health", month: "March", year: 2026, claimTotal: 45000, rate: 5, taxAmount: 2250 },
  { id: 2, insurance: "ACE Insurance", month: "March", year: 2026, claimTotal: 32000, rate: 5, taxAmount: 1600 },
  { id: 3, insurance: "APEX Health", month: "March", year: 2026, claimTotal: 28000, rate: 5, taxAmount: 1400 },
  { id: 4, insurance: "ACACIA Health", month: "February", year: 2026, claimTotal: 41000, rate: 5, taxAmount: 2050 },
];

export default function WithholdingTax() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Withholding Tax</h1>
        <p className="page-description">Automatic withholding tax computation by insurer</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Current Tax Rate</p>
          <p className="text-2xl font-bold font-heading text-primary mt-1">5.0%</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total Tax (March)</p>
          <p className="text-2xl font-bold font-heading mt-1">GH¢ 5,250</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total Claims (March)</p>
          <p className="text-2xl font-bold font-heading mt-1">GH¢ 105,000</p>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by insurer..." className="pl-10 h-9" />
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Insurance Company</th>
              <th>Month</th>
              <th>Year</th>
              <th>Claim Total (GH¢)</th>
              <th>Tax Rate</th>
              <th>Tax Amount (GH¢)</th>
            </tr>
          </thead>
          <tbody>
            {mockTax.map((t) => (
              <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                <td className="font-medium">{t.insurance}</td>
                <td>{t.month}</td>
                <td>{t.year}</td>
                <td>{t.claimTotal.toLocaleString()}</td>
                <td>{t.rate}%</td>
                <td className="font-semibold text-primary">{t.taxAmount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
