import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";

type TableName = "insurance_companies" | "client_companies" | "doctors" | "procedures" | "patients" | "pre_authorizations" | "preauth_items" | "claims" | "payments" | "withholding_tax" | "notifications" | "profiles" | "user_roles" | "system_settings" | "diagnosis_codes" | "procedure_templates" | "ledger_entries" | "preauth_catalog_items" | "audit_logs" | "preauth_versions" | "preauth_email_log" | "chat_messages";

const REALTIME_TABLES = ["claims", "payments", "withholding_tax", "ledger_entries"];
const STALE_TIME_MS = 60_000;
const GC_TIME_MS = 10 * 60_000;

function scopeInsertValues(table: TableName, values: Record<string, any>) {
  if (table !== "pre_authorizations") return values;
  const facilityId = getStoredFacilityId();
  if (!facilityId) {
    throw new Error("Facility context is required before creating a pre-authorization request.");
  }
  if (values.facility_id && values.facility_id !== facilityId) {
    throw new Error("The selected facility does not match the current pre-authorization context.");
  }
  return { ...values, facility_id: facilityId };
}

export function useSupabaseQuery(table: TableName, options?: { select?: string; orderBy?: string; filters?: Record<string, any> }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!REALTIME_TABLES.includes(table)) return;
    const channel = supabase
      .channel(`realtime-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        queryClient.invalidateQueries({ queryKey: [table] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table, queryClient]);

  return useQuery({
    queryKey: [table, options?.select, options?.orderBy, options?.filters],
    queryFn: async () => {
      let query = (supabase.from(table) as any).select(options?.select || "*");
      if (options?.filters) {
        Object.entries(options.filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
      query = options?.orderBy
        ? query.order(options.orderBy, { ascending: false })
        : query.order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export function useSupabaseInsert(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const scopedValues = scopeInsertValues(table, values);
      const { data, error } = await (supabase.from(table) as any).insert(scopedValues).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [table] });
      if (table === "claims") {
        queryClient.invalidateQueries({ queryKey: ["withholding_tax"] });
        queryClient.invalidateQueries({ queryKey: ["ledger_entries"] });
      }
      if (table === "payments") queryClient.invalidateQueries({ queryKey: ["ledger_entries"] });
    },
  });
}

export function useSupabaseBulkInsert(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, any>[]) => {
      const scopedRows = rows.map((row) => scopeInsertValues(table, row));
      const { data, error } = await (supabase.from(table) as any).insert(scopedRows).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });
}

export function useSupabaseDelete(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(table) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });
}
