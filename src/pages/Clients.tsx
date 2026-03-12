import { Plus, Search, Building2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const mockClients = [
  { id: 1, name: "Golden Star Mining", insurance: "ACACIA Health", contact: "James Owusu", email: "james@gsm.com", phone: "+233 24 123 4567" },
  { id: 2, name: "Coastal Fishing Co.", insurance: "ACE Insurance", contact: "Abena Frimpong", email: "abena@cfc.com", phone: "+233 20 987 6543" },
  { id: 3, name: "Volta Textiles Ltd", insurance: "APEX Health", contact: "Kwesi Mensah", email: "kwesi@vtl.com", phone: "+233 27 555 1234" },
];

export default function Clients() {
  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Client Companies</h1>
          <p className="page-description">Manage registered client companies and their insurance mappings</p>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4" />Add Client</Button>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search clients..." className="pl-10 h-9" />
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Insurance Partner</th>
              <th>Contact Person</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockClients.map((c) => (
              <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                <td className="font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  {c.name}
                </td>
                <td>{c.insurance}</td>
                <td>{c.contact}</td>
                <td className="text-muted-foreground">{c.email}</td>
                <td className="text-muted-foreground">{c.phone}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                    <button className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-4 h-4 text-destructive" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
