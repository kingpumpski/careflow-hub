import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import AidahBubble from "@/components/ai/AidahBubble";

/** Application shell: persistent sidebar, sticky header, responsive mobile drawer. */
export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen w-full bg-background overflow-x-hidden">
      <div className="hidden lg:block shrink-0">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex overscroll-contain">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full max-w-[88vw] overflow-y-auto overscroll-contain animate-in slide-in-from-left duration-200">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 w-full">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div className="shell-content max-w-[1600px] mx-auto w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>

      <AidahBubble />
    </div>
  );
}
