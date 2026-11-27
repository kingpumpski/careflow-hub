import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Bell, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications, type CareFlowNotification } from "@/hooks/useNotifications";

function internalPath(value?: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) return null;
  return value;
}

export default function Notifications() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    isEnhanced,
    isAvailable,
    markRead,
    markAllRead,
    deleteNotification,
  } = useNotifications(100);

  const openNotification = async (notification: CareFlowNotification) => {
    if (!notification.read) await markRead(notification.id);
    const path = isEnhanced ? internalPath(notification.action_url) : null;
    if (path) navigate(path);
  };

  return (
    <div className="space-y-6">
      <header className="page-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notifications
            {unreadCount > 0 && <Badge variant="destructive">{unreadCount} unread</Badge>}
          </h1>
          <p className="page-description">Activity updates, workflow alerts and important changes affecting your work.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={() => void markAllRead()}>
            <CheckCheck className="mr-2 h-4 w-4" /> Mark all as read
          </Button>
        )}
      </header>

      {!isEnhanced && isAvailable && (
        <div role="status" className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-semibold">Enhanced activity notifications are awaiting database release</p>
          <p className="mt-1 text-muted-foreground">You can still read and manage existing notifications. Automatic audit-event delivery and direct links to affected records will activate after the reviewed notification migration is deployed and its release flag is enabled.</p>
        </div>
      )}

      {!isAvailable ? (
        <div className="stat-card py-12 text-center text-sm text-muted-foreground">Sign in with an online account to view your notifications.</div>
      ) : isLoading ? (
        <div className="stat-card py-12 text-center text-sm text-muted-foreground">Loading notifications…</div>
      ) : notifications.length === 0 ? (
        <div className="stat-card py-12 text-center text-muted-foreground">
          <Bell className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p className="font-medium">You're all caught up</p>
          <p className="mt-1 text-sm">New project activity will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const path = isEnhanced ? internalPath(notification.action_url) : null;
            return (
              <article key={notification.id} className={`stat-card flex min-w-0 items-start justify-between gap-3 ${!notification.read ? "border-l-4 border-l-primary" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h2 className={`break-words font-semibold ${notification.read ? "text-muted-foreground" : "text-foreground"}`}>{notification.title}</h2>
                    {!notification.read && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
                    {notification.category && <Badge variant="outline" className="text-[10px] capitalize">{notification.category}</Badge>}
                  </div>
                  <p className="break-words text-sm text-muted-foreground">{notification.message || "A project activity has been recorded."}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</p>
                  {path && (
                    <Button variant="link" size="sm" className="mt-1 h-auto px-0" onClick={() => void openNotification(notification)}>
                      Open related section <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!notification.read && (
                    <Button variant="ghost" size="icon" onClick={() => void markRead(notification.id)} aria-label="Mark notification as read">
                      <CheckCheck className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => void deleteNotification(notification.id)} aria-label="Delete notification">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {notifications.length === 100 && <p className="text-center text-xs text-muted-foreground">Showing the 100 most recent notifications.</p>}
    </div>
  );
}
