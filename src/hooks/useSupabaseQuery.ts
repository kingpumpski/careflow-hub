import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type TableName = "insurance_companies" | "client_companies" | "doctors" | "procedures" | "patients" | "pre_authorizations" | "preauth_items" | "claims" | "payments" | "withholding_tax" | "notifications" | "profiles" | "user_roles" | "system_settings" | "diagnosis_codes" | "procedure_templates" | "ledger_entries";

const REALTIME_TABLES = ["claims", "payments", "withholding_tax", "ledger_entries"];

export function useSupabaseQuery(table: TableName, options?: { select?: string; orderBy?: string; filters?: Record<string, any> }) {
  const queryClient = useQueryClient();

  // Subscribe to realtime changes for key tables
  useEffect(() => {
    if (!REALTIME_TABLES.includes(table)) return;

    const channel = supabase
      .channel(`realtime-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        queryClient.invalidateQueries({ queryKey: [table] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table, queryClient]);

  return useQuery({
    queryKey: [table, options?.filters],
    queryFn: async () => {
      let query = (supabase.from(table) as any).select(options?.select || "*");
      if (options?.filters) {
        Object.entries(options.filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
      if (options?.orderBy) {
        query = query.order(options.orderBy, { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useSupabaseInsert(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const { data, error } = await (supabase.from(table) as any).insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate all related tables for accounting cascade
      queryClient.invalidateQueries({ queryKey: [table] });
      if (table === "claims") {
        queryClient.invalidateQueries({ queryKey: ["withholding_tax"] });
        queryClient.invalidateQueries({ queryKey: ["ledger_entries"] });
      }
      if (table === "payments") {
        queryClient.invalidateQueries({ queryKey: ["ledger_entries"] });
      }
    },
  });
}

export function useSupabaseBulkInsert(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, any>[]) => {
      const { data, error } = await (supabase.from(table) as any).insert(rows).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] });
    },
  });
}

export function useSupabaseUpdate(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Record<string, any>) => {
      const { data, error } = await (supabase.from(table) as any).update(values).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] });
    },
  });
}

export function useSupabaseDelete(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(table) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] });
    },
  });
}
