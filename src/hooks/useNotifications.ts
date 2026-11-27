import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { databaseCapabilities } from "@/config/databaseCapabilities";
import { isOfflineMode } from "@/modules/offline/data-mode";
import { canPersistRemoteUserNotification } from "@/modules/offline/notificationGuard";

export type CareFlowNotification = {
  id: string;
  user_id: string | null;
  title: string;
  message: string | null;
  read: boolean | null;
  created_at: string;
  action_url?: string | null;
  category?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  facility_id?: string | null;
  actor_id?: string | null;
  read_at?: string | null;
};

export function useNotifications(limit = 10) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const enhanced = databaseCapabilities.notificationEvents;
  const canQuery = canPersistRemoteUserNotification(user?.id, isOfflineMode());
  const queryKey = ["notifications", user?.id, limit, enhanced] as const;

  const feed = useQuery({
    queryKey,
    enabled: canQuery,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!user?.id) return [] as CareFlowNotification[];
      const fields = enhanced
        ? "id,title,message,read,created_at,user_id,action_url,category,entity_type,entity_id,facility_id,actor_id,read_at"
        : "id,title,message,read,created_at,user_id";
      const { data, error } = await supabase
        .from("notifications")
        .select(fields)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as CareFlowNotification[];
    },
  });

  const unread = useQuery({
    queryKey: ["notifications", user?.id, "unread-count"],
    enabled: canQuery,
    staleTime: 15_000,
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .or("read.eq.false,read.is.null");
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!canQuery || !user?.id) return;
    const channel = supabase
      .channel(`careflow-notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canQuery, queryClient, user?.id]);

  const invalidate = async () => {
    if (!user?.id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", user.id] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", user.id, "unread-count"] }),
    ]);
  };

  const markRead = async (id: string) => {
    if (!user?.id) return;
    const update = enhanced ? { read: true, read_at: new Date().toISOString() } : { read: true };
    const { error } = await supabase
      .from("notifications")
      .update(update)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Could not update notification", { description: error.message });
      return;
    }
    await invalidate();
  };

  const markAllRead = async () => {
    if (!user?.id || (unread.data ?? 0) === 0) return;
    const update = enhanced ? { read: true, read_at: new Date().toISOString() } : { read: true };
    const { error } = await supabase
      .from("notifications")
      .update(update)
      .eq("user_id", user.id)
      .or("read.eq.false,read.is.null");
    if (error) {
      toast.error("Could not mark notifications as read", { description: error.message });
      return;
    }
    toast.success("All notifications marked as read");
    await invalidate();
  };

  const deleteNotification = async (id: string) => {
    if (!user?.id) return;
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Could not delete notification", { description: error.message });
      return;
    }
    await invalidate();
  };

  return {
    notifications: feed.data ?? [],
    unreadCount: unread.data ?? 0,
    isLoading: feed.isLoading || unread.isLoading,
    isEnhanced: enhanced,
    isAvailable: canQuery,
    markRead,
    markAllRead,
    deleteNotification,
  };
}
