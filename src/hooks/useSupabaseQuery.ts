import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { listOffline, type OfflineEntity } from "@/modules/offline/offline-store";
import { enqueueSyncOperation } from "@/modules/offline/sync-queue";

type TableName = "insurance_companies" | "client_companies" | "doctors" | "procedures" | "patients" | "pre_authorizations" | "preauth_items" | "claims" | "payments" | "withholding_tax" | "notifications" | "profiles" | "user_roles" | "system_settings" | "diagnosis_codes" | "procedure_templates" | "ledger_entries" | "preauth_catalog_items" | "audit_logs" | "preauth_versions" | "preauth_email_log" | "chat_messages" | "claims_settlement_periods" | "settlement_exceptions" | "settlement_exception_audit_events" | "claims_outstanding_periods";

const REALTIME_TABLES = ["claims", "payments", "withholding_tax", "ledger_entries"];
const OFFLINE_ENTITY_BY_TABLE: Partial<Record<TableName, OfflineEntity>> = {
  insurance_companies: "insurance_companies", doctors: "doctors", procedures: "procedures", patients: "patients",
  system_settings: "system_settings", diagnosis_codes: "diagnosis_codes", preauth_catalog_items: "preauth_catalog_items",
  pre_authorizations: "preauthorizations", preauth_items: "preauth_items", claims_settlement_periods: "claims_settlement_periods",
  settlement_exceptions: "settlement_exceptions", settlement_exception_audit_events: "settlement_exception_audit_events",
};
const STALE_TIME_MS = 60_000;
const GC_TIME_MS = 10 * 60_000;

function scopeInsertValues(table: TableName, values: Record<string, any>) {
  if (table !== "pre_authorizations" && table !== "claims_settlement_periods" && table !== "settlement_exceptions" && table !== "settlement_exception_audit_events") return values;
  const facilityId = getStoredFacilityId();
  if (!facilityId) throw new Error("Facility context is required before creating a record.");
  if (values.facility_id && values.facility_id !== facilityId) throw new Error("The selected facility does not match the current context.");
  return { ...values, facility_id: facilityId };
}

async function listOfflineTable(table: TableName, options?: { orderBy?: string; filters?: Record<string, any> }) {
  const entity = OFFLINE_ENTITY_BY_TABLE[table];
  if (!entity) return [];
  let rows = await listOffline<Record<string, any>>(entity);
  if (options?.filters) rows = rows.filter((row) => Object.entries(options.filters!).every(([key, value]) => row[key] === value));
  if (options?.orderBy) rows.sort((a, b) => String(b[options.orderBy!] ?? "").localeCompare(String(a[options.orderBy!] ?? "")));
  else rows.sort((a, b) => String(b.created_at ?? b.updated_at ?? "").localeCompare(String(a.created_at ?? a.updated_at ?? "")));
  return rows;
}

export function useSupabaseQuery(table: TableName, options?: { select?: string; orderBy?: string; filters?: Record<string, any>; enabled?: boolean }) {
  const queryClient = useQueryClient();
  const offline = getCareFlowDataMode() === "offline";
  const enabled = options?.enabled ?? true;
  useEffect(() => {
    if (!enabled || offline || !REALTIME_TABLES.includes(table)) return;
    const channel = supabase.channel(`realtime-${table}`).on("postgres_changes", { event: "*", schema: "public", table }, () => queryClient.invalidateQueries({ queryKey: [table] })).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table, queryClient, offline, enabled]);
  return useQuery({
    queryKey: [table, options?.select, options?.orderBy, options?.filters, offline, enabled],
    enabled,
    queryFn: async () => {
      if (offline) return listOfflineTable(table, options);
      let query = ((supabase as any).from(table)).select(options?.select || "*");
      if (options?.filters) Object.entries(options.filters).forEach(([key, value]) => { query = query.eq(key, value); });
      query = options?.orderBy ? query.order(options.orderBy, { ascending: false }) : table === "claims_outstanding_periods" ? query.order("period_year", { ascending: false }).order("period_month", { ascending: false }) : table === "audit_logs" ? query.order("changed_at", { ascending: false }) : query.order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: STALE_TIME_MS, gcTime: GC_TIME_MS, retry: 1, refetchOnWindowFocus: false,
  });
}

function validateOfflineSettlementUpdate(existing: Record<string, any>, values: Record<string, any>) {
  const currentStatus = String(existing.settlement_status ?? "awaiting_payment");
  const nextStatus = String(values.settlement_status ?? currentStatus);
  const allowed = (currentStatus === "awaiting_payment" && nextStatus === "payment_advice_received") || (currentStatus === "payment_advice_received" && nextStatus === "reconciled") || currentStatus === nextStatus;
  if (!allowed) throw new Error(`Invalid settlement transition: ${currentStatus} → ${nextStatus}.`);
  if (currentStatus === "reconciled") {
    const protectedFields = ["insurance_company_id", "period_start", "period_end", "period_type", "total_claims_submitted", "withholding_tax_rate", "provisional_withholding_tax", "payment_received", "rejection_amount", "actual_withholding_tax", "payment_advice_reference", "payment_advice_date", "withholding_tax_variance", "settlement_status"];
    if (protectedFields.some((field) => Object.prototype.hasOwnProperty.call(values, field))) throw new Error("A reconciled settlement is immutable and cannot be changed.");
  }
  if (nextStatus === "payment_advice_received") {
    const merged = { ...existing, ...values };
    if (merged.payment_received == null || merged.rejection_amount == null || merged.actual_withholding_tax == null || !String(merged.payment_advice_reference ?? "").trim() || !merged.payment_advice_date) throw new Error("Payment advice requires payment, rejection, actual WHT, advice reference, and advice date.");
  }
  if (nextStatus === "reconciled") {
    const merged = { ...existing, ...values };
    if (!merged.confirmed_by || !merged.confirmed_at || merged.payment_received == null || merged.rejection_amount == null || merged.actual_withholding_tax == null || !String(merged.payment_advice_reference ?? "").trim() || !merged.payment_advice_date) throw new Error("Settlement reconciliation requires complete payment advice and confirmation details.");
  }
}

export function useSupabaseInsert(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      if (getCareFlowDataMode() === "offline") {
        const entity = OFFLINE_ENTITY_BY_TABLE[table];
        if (!entity) throw new Error(`Offline storage is not configured for ${table}.`);
        const record = { id: values.id || crypto.randomUUID(), ...scopeInsertValues(table, values) };
        const { putOffline } = await import("@/modules/offline/offline-store");
        await putOffline(entity, record);
        await enqueueSyncOperation({ table, type: "insert", recordId: record.id, payload: record });
        return record;
      }
      const { data, error } = await ((supabase as any).from(table)).insert(scopeInsertValues(table, values)).select().single();
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
        await Promise.all(scopedRows.map((record) => enqueueSyncOperation({ table, type: "insert", recordId: record.id, payload: record })));
        return scopedRows;
      }
      const { data, error } = await ((supabase as any).from(table)).insert(rows.map((row) => scopeInsertValues(table, row))).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });
}

function normalizePreauthTransitionState(values: Record<string, any>) {
  const raw = String(values.current_state ?? values.status ?? "");
  const map: Record<string, string> = {
    draft: "Draft",
    pending: "PendingApproval",
    pendingapproval: "PendingApproval",
    approved: "Approved",
    rejected: "Rejected",
    completed: "Completed",
  };
  return map[raw.toLowerCase()] ?? raw;
}

export function useSupabaseUpdate(table: TableName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Record<string, any>) => {
      const offline = getCareFlowDataMode() === "offline";
      if (!offline && table === "pre_authorizations" && (Object.prototype.hasOwnProperty.call(values, "current_state") || Object.prototype.hasOwnProperty.call(values, "status"))) {
        const targetState = normalizePreauthTransitionState(values);
        if (!["Draft", "PendingApproval", "Approved", "Rejected", "Completed"].includes(targetState)) throw new Error(`Invalid pre-authorization state: ${targetState}`);
        const { data, error } = await (supabase.rpc as any)("transition_preauthorization_atomic", {
          p_preauth_id: id,
          p_target_state: targetState,
          p_note: values.rejection_reason ?? values.note ?? null,
        });
        if (error) throw error;
        return data;
      }
      if (offline) {
        const entity = OFFLINE_ENTITY_BY_TABLE[table];
        if (!entity) throw new Error(`Offline storage is not configured for ${table}.`);
        const { getOffline, putOffline } = await import("@/modules/offline/offline-store");
        const existing = await getOffline<Record<string, any>>(entity, id);
        if (!existing) throw new Error(`Offline record ${id} was not found.`);
        if (table === "claims_settlement_periods") validateOfflineSettlementUpdate(existing, values);
        const baseVersion = existing.updated_at ?? existing.updatedAt;
        const record = { ...existing, ...values, id, updated_at: new Date().toISOString() };
        await putOffline(entity, record);
        await enqueueSyncOperation({ table, type: "update", recordId: id, payload: record, ...(baseVersion != null ? { baseVersion } : {}) });
        return record;
      }
      const { data, error } = await ((supabase as any).from(table)).update(values).eq("id", id).select().single();
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
        const { getOffline, deleteOffline } = await import("@/modules/offline/offline-store");
        const existing = await getOffline<Record<string, any>>(entity, id);
        if (!existing) throw new Error(`Offline record ${id} was not found.`);
        const baseVersion = existing.updated_at ?? existing.updatedAt;
        await deleteOffline(entity, id);
        await enqueueSyncOperation({ table, type: "delete", recordId: id, payload: existing, ...(baseVersion != null ? { baseVersion } : {}) });
        return;
      }
      const { error } = await ((supabase as any).from(table)).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });
}
