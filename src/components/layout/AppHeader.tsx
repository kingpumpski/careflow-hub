import { Search, User, Moon, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import NotificationsPopover from "./NotificationsPopover";
import { useEffect, useState } from "react";

export default function AppHeader() {
  const { profile, userRole } = useAuth();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDark(true);
  }, []);

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
        <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="h-9 w-9">
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
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
