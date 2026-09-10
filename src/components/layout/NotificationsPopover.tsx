import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useSupabaseQuery, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/contexts/AuthContext";
import { isOfflineMode } from "@/modules/offline/data-mode";

export default function NotificationsPopover() {
  const { user } = useAuth();
  const offline = isOfflineMode();
  const { data: notifications } = useSupabaseQuery("notifications", {
    select: "id,title,message,read,created_at,user_id",
    filters: !offline && user ? { user_id: user.id } : undefined,
    limit: 10,
  });
  const updateMutation = useSupabaseUpdate("notifications");
  const [open, setOpen] = useState(false);
  const unreadCount = (notifications || []).filter((n: any) => !n.read).length;
  const markAsRead = async (id: string) => { await updateMutation.mutateAsync({ id, read: true }); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button className="relative flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Notifications"><Bell className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />{unreadCount > 0 && <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-0.5 bg-destructive rounded-full text-[10px] text-destructive-foreground flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>}</button></PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-5rem)] overflow-hidden p-0">
        <div className="p-3 border-b border-border min-w-0"><h4 className="font-heading font-semibold text-sm truncate">Notifications</h4></div>
        <div className="max-h-[50dvh] overflow-y-auto overscroll-contain">{(notifications || []).length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No notifications yet</p> : (notifications || []).map((n: any) => <div key={n.id} className={`p-3 border-b border-border/50 text-sm min-w-0 ${n.read ? "opacity-60" : ""}`}><div className="flex items-start justify-between gap-2 min-w-0"><div className="min-w-0 max-w-full overflow-hidden"><p className="font-medium text-xs break-words [overflow-wrap:anywhere]">{n.title}</p><p className="text-xs text-muted-foreground mt-0.5 break-words [overflow-wrap:anywhere]">{n.message}</p></div>{!n.read && <Button variant="ghost" size="icon" className="shrink-0 w-9 h-9 min-h-9 min-w-9" onClick={() => markAsRead(n.id)} aria-label="Mark notification as read"><Check className="w-3.5 h-3.5" /></Button>}</div></div>)}</div>
      </PopoverContent>
    </Popover>
  );
}
