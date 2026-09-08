import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { listOffline, type OfflineEntity } from "@/modules/offline/offline-store";

type TableName = "insurance_companies" | "client_companies" | "doctors" | "procedures" | "patients" | "pre_authorizations" | "preauth_items" | "claims" | "payments" | "withholding_tax" | "notifications" | "profiles" | "user_roles" | "system_settings" | "diagnosis_codes" | "procedure_templates" | "ledger_entries" | "preauth_catalog_items" | "audit_logs" | "preauth_versions" | "preauth_email_log" | "chat_messages";

const REALTIME_TABLES = ["claims", "payments", "withholding_tax", "ledger_entries"];
const OFFLINE_ENTITY_BY_TABLE: Partial<Record<TableName, OfflineEntity>> = {
  insurance_companies: "insurance_companies",
  doctors: "doctors",
  procedures: "procedures",
  patients: "patients",
  system_settings: "system_settings",
  diagnosis_codes: "diagnosis_codes",
  preauth_catalog_items: "preauth_catalog_items",
  pre_authorizations: "preauthorizations",
  preauth_items: "preauth_items",
};
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

async function listOfflineTable(table: TableName, options?: { orderBy?: string; filters?: Record<string, any> }) {
  const entity = OFFLINE_ENTITY_BY_TABLE[table];
  if (!entity) return [];
  let rows = await listOffline<Record<string, any>>(entity);
  if (options?.filters) {
    rows = rows.filter((row) => Object.entries(options.filters!).every(([key, value]) => row[key] === value));
  }
  if (options?.orderBy) {
    const key = options.orderBy;
    rows.sort((a, b) => String(b[key] ?? "").localeCompare(String(a[key] ?? "")));
  } else {
    rows.sort((a, b) => String(b.created_at ?? b.updated_at ?? "").localeCompare(String(a.created_at ?? a.updated_at ?? "")));
  }
  return rows;
}

export function useSupabaseQuery(table: TableName, options?: { select?: string; orderBy?: string; filters?: Record<string, any> }) {
  const queryClient = useQueryClient();
  const offline = getCareFlowDataMode() === "offline";

  useEffect(() => {
    if (offline || !REALTIME_TABLES.includes(table)) return;
    const channel = supabase
      .channel(`realtime-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        queryClient.invalidateQueries({ queryKey: [table] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table, queryClient, offline]);

  return useQuery({
    queryKey: [table, options?.select, options?.orderBy, options?.filters, offline],
    queryFn: async () => {
      if (offline) return listOfflineTable(table, options);
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
      if (getCareFlowDataMode() === "offline") {
        const entity = OFFLINE_ENTITY_BY_TABLE[table];
        if (!entity) throw new Error(`Offline storage is not configured for ${table}.`);
        const scopedValues = scopeInsertValues(table, values);
        const record = { id: scopedValues.id || crypto.randomUUID(), ...scopedValues };
        const { putOffline } = await import("@/modules/offline/offline-store");
        await putOffline(entity, record);
        return record;
      }
      const scopedValues = scopeInsertValues(table, values);
      const { data, error } = await (supabase.from(table) as any).insert(scopedValues).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });
}

export function useSupabaseBulkInsert(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, any>[]) => {
      if (getCareFlowDataMode() === "offline") {
        const entity = OFFLINE_ENTITY_BY_TABLE[table];
        if (!entity) throw new Error(`Offline storage is not configured for ${table}.`);
        const { putManyOffline } = await import("@/modules/offline/offline-store");
        const scopedRows = rows.map((row) => ({ id: row.id || crypto.randomUUID(), ...scopeInsertValues(table, row) }));
        await putManyOffline(entity, scopedRows);
        return scopedRows;
      }
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
      if (getCareFlowDataMode() === "offline") {
        const entity = OFFLINE_ENTITY_BY_TABLE[table];
        if (!entity) throw new Error(`Offline storage is not configured for ${table}.`);
        const { getOffline, putOffline } = await import("@/modules/offline/offline-store");
        const existing = await getOffline<Record<string, any>>(entity, id);
        if (!existing) throw new Error(`Offline record ${id} was not found.`);
        const record = { ...existing, ...values, id, updated_at: new Date().toISOString() };
        await putOffline(entity, record);
        return record;
      }
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
      if (getCareFlowDataMode() === "offline") {
        const entity = OFFLINE_ENTITY_BY_TABLE[table];
        if (!entity) throw new Error(`Offline storage is not configured for ${table}.`);
        const { deleteOffline } = await import("@/modules/offline/offline-store");
        await deleteOffline(entity, id);
        return;
      }
      const { error } = await (supabase.from(table) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });
}
