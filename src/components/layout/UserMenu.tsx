import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { User, Settings, RefreshCw, LogOut, ClipboardList, UserCircle, MessageSquare, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function UserMenu() {
  const { profile, userRole, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [clicked, setClicked] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = () => {
    setOpen((v) => !v);
    setClicked(true);
    setTimeout(() => setClicked(false), 300);
  };

  const roleLabel: Record<string, string> = {
    superuser: "Superuser", admin: "Admin", claims_officer: "Claims Officer",
    accounts_officer: "Accounts Officer", data_entry_officer: "Data Entry",
    auditor: "Auditor", viewer: "Viewer",
  };

  const go = (path: string) => { navigate(path); setOpen(false); };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    else toast({ title: "Password reset email sent", description: `Check ${user.email}` });
    setOpen(false);
  };

  const items = [
    { label: "My Profile", icon: UserCircle, action: () => go("/profile") },
    { label: "Messages", icon: MessageSquare, action: () => go("/chat") },
    { label: "Settings", icon: Settings, action: () => go("/settings") },
    { label: "Audit Trail", icon: ClipboardList, action: () => go("/audit-trail") },
    { label: "Reset Password", icon: KeyRound, action: handlePasswordReset },
    { label: "Refresh Page", icon: RefreshCw, action: () => window.location.reload() },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className={cn(
          "flex items-center gap-3 pl-4 border-l border-border transition-transform outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md",
          clicked && "scale-95",
        )}
      >
        <div className={cn(
          "w-8 h-8 rounded-full bg-primary flex items-center justify-center transition-all",
          open && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
          clicked && "animate-pulse",
        )}>
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="text-sm text-left hidden sm:block">
          <p className="font-medium leading-none">{profile?.full_name || "User"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{roleLabel[userRole || ""] || "Viewer"}</p>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-popover shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-3 border-b border-border bg-muted/40">
            <p className="text-sm font-semibold">{profile?.full_name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            <p className="text-[10px] uppercase tracking-wider mt-1 text-primary font-medium">
              {roleLabel[userRole || ""] || "Viewer"}
            </p>
          </div>
          <div className="py-1">
            {items.map((it) => (
              <button
                key={it.label}
                onClick={it.action}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
              >
                <it.icon className="w-4 h-4 text-muted-foreground" />
                {it.label}
              </button>
            ))}
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={() => { signOut(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-destructive/10 text-destructive transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
