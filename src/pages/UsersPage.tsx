import { Plus, Search, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const mockUsers = [
  { id: 1, name: "Admin User", email: "pumpski6@gmail.com", role: "Superuser", status: "active", lastLogin: "2026-03-12" },
  { id: 2, name: "Sarah Mensah", email: "sarah@medclaims.com", role: "Claims Officer", status: "active", lastLogin: "2026-03-11" },
  { id: 3, name: "James Osei", email: "james@medclaims.com", role: "Accounts Officer", status: "active", lastLogin: "2026-03-10" },
];

const roleColors: Record<string, string> = {
  Superuser: "bg-destructive/10 text-destructive border-destructive/20",
  Admin: "bg-primary/10 text-primary border-primary/20",
  "Claims Officer": "bg-info/10 text-info border-info/20",
  "Accounts Officer": "bg-success/10 text-success border-success/20",
};

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-description">Manage system users and role assignments</p>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4" />Add User</Button>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search users..." className="pl-10 h-9" />
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {mockUsers.map((u) => (
              <tr key={u.id} className="hover:bg-muted/50 transition-colors">
                <td className="font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  {u.name}
                </td>
                <td className="text-muted-foreground">{u.email}</td>
                <td>
                  <Badge variant="outline" className={roleColors[u.role] || ""}>
                    {u.role}
                  </Badge>
                </td>
                <td>
                  <Badge variant="secondary" className="bg-success/10 text-success">
                    {u.status}
                  </Badge>
                </td>
                <td className="text-muted-foreground">{u.lastLogin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
