import { useEffect, useState } from "react";
import { Menu, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import NotificationsPopover from "./NotificationsPopover";
import UserMenu from "./UserMenu";
import Breadcrumbs from "./Breadcrumbs";

export default function Header({ onMenuClick }: { onMenuClick?: () => void } = {}) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (localStorage.getItem("theme") === "dark") setDark(true);
  }, []);

  return (
    <header className="h-16 sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md flex items-center justify-between gap-3 px-3 md:px-6 no-print">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9 shrink-0" onClick={onMenuClick} aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </Button>
        <div className="relative w-full max-w-xs hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search patients, claims, procedures..." className="pl-10 bg-muted/50 border-0 h-9 text-sm" />
        </div>
        <div className="min-w-0 hidden sm:block">
          <Breadcrumbs />
        </div>
      </div>
      <div className="flex items-center gap-1 md:gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="h-9 w-9" aria-label="Toggle theme">
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <NotificationsPopover />
        <UserMenu />
      </div>
    </header>
  );
}
