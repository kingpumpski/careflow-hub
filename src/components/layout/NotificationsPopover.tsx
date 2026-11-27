import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Bell, Check, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useNotifications, type CareFlowNotification } from "@/hooks/useNotifications";

function internalPath(value?: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) return null;
  return value;
}

export default function NotificationsPopover() {
  const navigate = useNavigate();
  const { notifications, unreadCount, isEnhanced, isAvailable, markRead, markAllRead } = useNotifications(8);
  const [open, setOpen] = useState(false);

  const openNotification = async (notification: CareFlowNotification) => {
    if (!notification.read) await markRead(notification.id);
    const path = isEnhanced ? internalPath(notification.action_url) : null;
    setOpen(false);
    navigate(path ?? "/notifications");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <Bell className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground" aria-live="polite">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div>
            <h4 className="font-heading text-sm font-semibold">Notifications</h4>
            <p className="text-xs text-muted-foreground">{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => void markAllRead()}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
        {!isAvailable ? (
          <p className="px-4 py-7 text-center text-sm text-muted-foreground">Notifications are available after you sign in online.</p>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <div className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain">
            {notifications.map((notification) => (
              <div key={notification.id} className={`border-b border-border/60 p-3 last:border-b-0 ${notification.read ? "opacity-70" : "bg-primary/[0.035]"}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? "bg-muted-foreground/30" : "bg-primary"}`} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openNotification(notification)}>
                    <span className="block break-words text-xs font-semibold">{notification.title}</span>
                    <span className="mt-0.5 block break-words text-xs text-muted-foreground">{notification.message || "A project activity has been recorded."}</span>
                    <span className="mt-1.5 block text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</span>
                  </button>
                  {!notification.read && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => void markRead(notification.id)} aria-label="Mark notification as read">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isEnhanced && internalPath(notification.action_url) && <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-border bg-muted/20 p-2">
          <Button variant="ghost" className="w-full justify-between" onClick={() => { setOpen(false); navigate("/notifications"); }}>
            View notification centre <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
