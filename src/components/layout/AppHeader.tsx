import { Search, Moon, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import NotificationsPopover from "./NotificationsPopover";
import UserMenu from "./UserMenu";
import { useEffect, useState } from "react";

export default function AppHeader() {
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
        <UserMenu />
      </div>
    </header>
  );
}
