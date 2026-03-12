import { CreditCard, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const mockPayments = [
  { id: "PAY-001", claim: "CLM-001", insurance: "ACACIA Health", amount: "GH¢ 3,600", date: "2026-03-08", method: "Bank Transfer", ref: "TRF-9281" },
  { id: "PAY-002", claim: "CLM-006", insurance: "ACE Insurance", amount: "GH¢ 1,500", date: "2026-03-12", method: "Cheque", ref: "CHQ-4520" },
  { id: "PAY-003", claim: "CLM-010", insurance: "APEX Health", amount: "GH¢ 5,200", date: "2026-03-05", method: "Bank Transfer", ref: "TRF-7743" },
];

export default function Payments() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Payment Tracking</h1>
        <p className="page-description">Monitor payments received from insurance companies</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total Received</p>
          <p className="text-2xl font-bold font-heading text-success mt-1">GH¢ 10,300</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Outstanding</p>
          <p className="text-2xl font-bold font-heading text-warning mt-1">GH¢ 16,350</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">This Month</p>
          <p className="text-2xl font-bold font-heading text-primary mt-1">GH¢ 5,100</p>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search payments..." className="pl-10 h-9" />
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Payment ID</th>
              <th>Claim</th>
              <th>Insurance Company</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Method</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {mockPayments.map((p) => (
              <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                <td className="font-medium text-primary">{p.id}</td>
                <td className="text-muted-foreground">{p.claim}</td>
                <td>{p.insurance}</td>
                <td className="font-semibold text-success">{p.amount}</td>
                <td className="text-muted-foreground">{p.date}</td>
                <td><Badge variant="secondary">{p.method}</Badge></td>
                <td className="text-muted-foreground font-mono text-xs">{p.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
