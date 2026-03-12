import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useSupabaseQuery, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/contexts/AuthContext";

export default function NotificationsPopover() {
  const { user } = useAuth();
  const { data: notifications } = useSupabaseQuery("notifications", {
    filters: user ? { user_id: user.id } : undefined,
  });
  const updateMutation = useSupabaseUpdate("notifications");
  const [open, setOpen] = useState(false);

  const unreadCount = (notifications || []).filter((n: any) => !n.read).length;

  const markAsRead = async (id: string) => {
    await updateMutation.mutateAsync({ id, read: true });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-destructive rounded-full text-[10px] text-destructive-foreground flex items-center justify-center font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border">
          <h4 className="font-heading font-semibold text-sm">Notifications</h4>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {(notifications || []).length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">No notifications yet</p>
          ) : (
            (notifications || []).slice(0, 10).map((n: any) => (
              <div key={n.id} className={`p-3 border-b border-border/50 text-sm ${n.read ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-xs">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  </div>
                  {!n.read && (
                    <Button variant="ghost" size="icon" className="shrink-0 w-6 h-6" onClick={() => markAsRead(n.id)}>
                      <Check className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
