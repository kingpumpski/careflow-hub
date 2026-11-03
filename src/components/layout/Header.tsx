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
    <header className="sticky top-0 z-30 flex h-14 w-full min-w-0 shrink-0 items-center overflow-visible border-b border-border bg-card/90 px-2 backdrop-blur-md sm:h-16 sm:px-3 md:px-6 no-print">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 md:gap-3 overflow-hidden">
        <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9 shrink-0" onClick={onMenuClick} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="hidden min-w-0 flex-1 overflow-hidden sm:block">
          <Breadcrumbs />
        </div>
      </div>
      <div className="ml-1 flex min-w-0 shrink-0 items-center gap-0 sm:ml-2">
        <div className="relative hidden w-[min(20rem,30vw)] min-w-0 shrink md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search patients, claims, procedures..." className="h-9 w-full border-0 bg-muted/50 pl-10 text-sm" />
        </div>
        <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" aria-label="Toggle theme">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <NotificationsPopover />
        <UserMenu />
      </div>
    </header>
  );
}
