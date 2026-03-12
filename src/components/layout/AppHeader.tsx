import { Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import NotificationsPopover from "./NotificationsPopover";

export default function AppHeader() {
  const { profile, userRole } = useAuth();

  const roleLabel: Record<string, string> = {
    superuser: "Superuser", admin: "Admin", claims_officer: "Claims Officer",
    accounts_officer: "Accounts Officer", data_entry_officer: "Data Entry", auditor: "Auditor", viewer: "Viewer",
  };

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search patients, claims, procedures..." className="pl-10 bg-muted/50 border-0 h-9 text-sm" />
      </div>
      <div className="flex items-center gap-4">
        <NotificationsPopover />
        <div className="flex items-center gap-3 pl-4 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <User className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="text-sm">
            <p className="font-medium leading-none">{profile?.full_name || "User"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{roleLabel[userRole || ""] || "Viewer"}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
