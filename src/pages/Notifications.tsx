import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useSupabaseQuery, useSupabaseUpdate, useSupabaseDelete } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function Notifications() {
  const { data: notifications } = useSupabaseQuery("notifications");
  const update = useSupabaseUpdate("notifications");
  const del = useSupabaseDelete("notifications");
  const qc = useQueryClient();

  const unreadCount = (notifications || []).filter((n: any) => !n.read).length;

  const markAllRead = async () => {
    const ids = (notifications || []).filter((n: any) => !n.read).map((n: any) => n.id);
    if (!ids.length) return;
    const { error } = await supabase.from("notifications").update({ read: true }).in("id", ids);
    if (error) toast.error(error.message);
    else {
      toast.success("All notifications marked as read");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Bell className="w-6 h-6" /> Notifications
            {unreadCount > 0 && <span className="badge badge-error">{unreadCount} new</span>}
          </h1>
          <p className="page-description">System alerts, payment confirmations, and workflow updates.</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary flex items-center gap-2">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {(notifications || []).length === 0 && (
          <div className="stat-card text-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
            You're all caught up — no notifications yet.
          </div>
        )}
        {(notifications || []).map((n: any) => (
          <div key={n.id} className={`stat-card flex items-start justify-between gap-4 ${!n.read ? "border-l-4 border-l-primary" : ""}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`font-semibold ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</h3>
                {!n.read && <span className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <p className="text-sm text-muted-foreground">{n.message}</p>
              <p className="text-xs text-muted-foreground mt-2">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
            </div>
            <div className="flex items-center gap-1">
              {!n.read && (
                <button onClick={() => update.mutate({ id: n.id, read: true })} className="p-2 rounded-md hover:bg-muted" title="Mark read">
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => del.mutate(n.id)} className="p-2 rounded-md hover:bg-destructive/10 text-destructive" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}