import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type TableName = "insurance_companies" | "client_companies" | "doctors" | "procedures" | "patients" | "pre_authorizations" | "preauth_items" | "claims" | "payments" | "withholding_tax" | "notifications" | "profiles" | "user_roles" | "system_settings" | "diagnosis_codes" | "procedure_templates";

export function useSupabaseQuery(table: TableName, options?: { select?: string; orderBy?: string; filters?: Record<string, any> }) {
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
      queryClient.invalidateQueries({ queryKey: [table] });
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
