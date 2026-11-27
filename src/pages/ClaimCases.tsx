import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Activity, Clock3, FilePlus2, History, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { usePermissions } from "@/modules/security";
import { CLAIM_STATUSES, getAvailableClaimTransitions, type ClaimStatus } from "@/modules/claims/lifecycle";
import { getLocalDateInputValue } from "@/modules/claims/dateInput";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { databaseCapabilities } from "@/config/databaseCapabilities";

type ClaimCase = {
  id: string;
  facility_id: string;
  claim_number: string;
  insurance_company_id: string;
  patient_name: string;
  member_number: string | null;
  procedure_name: string | null;
  date_of_service: string;
  submitted_amount: number;
  approved_amount: number | null;
  paid_amount: number;
  currency: string;
  status: ClaimStatus;
  denial_reason: string | null;
  created_at: string;
};

type InsuranceCompanyOption = { id: string; company_name: string; is_active: boolean };

type PreauthorizationOption = { id: string; request_number: string | null; insurance_company_id: string | null; procedure_date: string | null; provider_name: string | null };

type ClaimCaseEvent = {
  id: string;
  claim_case_id: string;
  from_status: string | null;
  to_status: string;
  note: string;
  actor_id: string;
  created_at: string;
};

type RpcResult = { data: unknown; error: { message: string } | null };

const callClaimRpc = (name: string, args: Record<string, unknown>): Promise<RpcResult> =>
  (supabase.rpc as unknown as (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResult>)(name, args);

const money = (amount: number | null | undefined, currency = "GHS") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency.trim() || "GHS", maximumFractionDigits: 2 }).format(Number(amount ?? 0));
const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function ClaimCases() {
  const facilityId = getStoredFacilityId();
  const offline = getCareFlowDataMode() === "offline";
  const { can, loading: permissionsLoading } = usePermissions();
  const queryClient = useQueryClient();
  const canRead = !permissionsLoading && can("claims.read");
  const canWrite = canRead && !permissionsLoading && can("claims.write");
  const { data: cases, isLoading, error: casesError } = useSupabaseQuery("claim_cases", {
    orderBy: "created_at",
    filters: facilityId ? { facility_id: facilityId } : undefined,
    enabled: !offline && databaseCapabilities.individualClaimCases && Boolean(facilityId) && canRead,
    missingSchemaBehavior: "error",
  });
  const { data: insurers } = useSupabaseQuery("insurance_companies", { enabled: !offline && canRead });
  const { data: preauthorizations } = useSupabaseQuery("pre_authorizations", {
    select: "id,request_number,insurance_company_id,procedure_date,provider_name",
    filters: facilityId ? { facility_id: facilityId } : undefined,
    enabled: !offline && Boolean(facilityId) && canRead && can("preauth.read"),
  });
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const { data: events, isLoading: eventsLoading, error: eventsError } = useSupabaseQuery("claim_case_events", {
    orderBy: "created_at",
    filters: selectedCaseId ? { claim_case_id: selectedCaseId } : undefined,
    enabled: !offline && databaseCapabilities.individualClaimCases && Boolean(selectedCaseId) && canRead,
    missingSchemaBehavior: "error",
  });
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    insurance_company_id: "",
    preauth_id: "",
    patient_name: "",
    member_number: "",
    date_of_service: getLocalDateInputValue(),
    procedure_name: "",
    diagnosis: "",
    submitted_amount: "",
    clinical_notes: "",
  });

  const insurerRows = useMemo(() => (insurers ?? []) as InsuranceCompanyOption[], [insurers]);
  const preauthorizationRows = useMemo(() => (preauthorizations ?? []) as PreauthorizationOption[], [preauthorizations]);
  const caseRows = useMemo(() => (cases ?? []) as ClaimCase[], [cases]);
  const eventRows = useMemo(() => (events ?? []) as ClaimCaseEvent[], [events]);
  const insurerById = useMemo(() => new Map(insurerRows.map((item) => [item.id, item.company_name])), [insurerRows]);
  const filteredCases = useMemo(() => caseRows.filter((item) => {
    const matchesSearch = [item.claim_number, item.patient_name, item.member_number ?? "", String(insurerById.get(item.insurance_company_id) ?? "")]
      .some((value) => value.toLowerCase().includes(search.toLowerCase()));
    return matchesSearch && (statusFilter === "all" || item.status === statusFilter);
  }), [caseRows, insurerById, search, statusFilter]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["claim_cases"] });
    if (selectedCaseId) await queryClient.invalidateQueries({ queryKey: ["claim_case_events"] });
  };

  const createCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!facilityId) {
      toast({ title: "Facility required", description: "Select an active facility in the Pre-Authorization area before creating a claim case.", variant: "destructive" });
      return;
    }
    const amount = Number(form.submitted_amount);
    if (!form.insurance_company_id || !form.patient_name.trim() || !form.date_of_service || !Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Check the required fields", description: "Insurer, patient name, service date and a positive submitted amount are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await callClaimRpc("create_individual_claim_case", {
        p_facility_id: facilityId,
        p_insurance_company_id: form.insurance_company_id,
        p_preauth_id: form.preauth_id || null,
        p_patient_name: form.patient_name.trim(),
        p_date_of_service: form.date_of_service,
        p_submitted_amount: amount,
        p_member_number: form.member_number.trim() || null,
        p_procedure_name: form.procedure_name.trim() || null,
        p_diagnosis: form.diagnosis.trim() || null,
        p_clinical_notes: form.clinical_notes.trim() || null,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] as { claim_number?: string } | undefined : data as { claim_number?: string } | null;
      toast({ title: "Individual claim case created", description: row?.claim_number ? `Reference: ${row.claim_number}` : "The new claim case is saved as a draft." });
      setForm({ insurance_company_id: "", preauth_id: "", patient_name: "", member_number: "", date_of_service: getLocalDateInputValue(), procedure_name: "", diagnosis: "", submitted_amount: "", clinical_notes: "" });
      setShowCreate(false);
      await refresh();
    } catch (cause) {
      toast({ title: "Unable to create claim case", description: cause instanceof Error ? cause.message : "The claim case could not be saved.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const transitionCase = async (item: ClaimCase, target: ClaimStatus) => {
    if (!canWrite) return;
    const note = window.prompt(`Add a note for ${titleCase(item.status)} → ${titleCase(target)}:`);
    if (!note?.trim()) return;
    let approvedAmount: number | null = null;
    let paidAmount: number | null = null;
    if (target === "approved" || target === "partially_approved") {
      const value = window.prompt("Enter the cumulative approved amount:");
      if (value === null) return;
      approvedAmount = Number(value);
      if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
        toast({ title: "Invalid approved amount", description: "Enter a positive amount.", variant: "destructive" });
        return;
      }
    }
    if (target === "partially_paid" || target === "paid") {
      const value = window.prompt("Enter the cumulative amount received to date:");
      if (value === null) return;
      paidAmount = Number(value);
      if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
        toast({ title: "Invalid payment amount", description: "Enter a positive cumulative payment amount.", variant: "destructive" });
        return;
      }
    }
    setTransitioningId(item.id);
    try {
      const { error } = await callClaimRpc("transition_individual_claim_case", {
        p_claim_case_id: item.id,
        p_target_status: target,
        p_note: note.trim(),
        p_approved_amount: approvedAmount,
        p_paid_amount: paidAmount,
        p_denial_reason: target === "rejected" ? note.trim() : null,
      });
      if (error) throw new Error(error.message);
      toast({ title: "Claim status updated", description: `${item.claim_number}: ${titleCase(target)}` });
      await refresh();
    } catch (cause) {
      toast({ title: "Transition rejected", description: cause instanceof Error ? cause.message : "The claim status could not be changed.", variant: "destructive" });
    } finally {
      setTransitioningId(null);
    }
  };

  if (permissionsLoading) {
    return <div className="stat-card py-12 text-center text-sm text-muted-foreground">Checking claim-case access…</div>;
  }

  if (!canRead) {
    return <div className="stat-card py-12 text-center"><h1 className="text-lg font-semibold">Access restricted</h1><p className="text-sm text-muted-foreground mt-2">Claims read permission is required to view individual claim cases.</p></div>;
  }

  if (!offline && !databaseCapabilities.individualClaimCases) {
    return <div className="stat-card space-y-2 p-6" role="status"><h1 className="text-lg font-semibold">Individual claim cases are not released in this database</h1><p className="text-sm text-muted-foreground">The production database does not yet contain the claim-case tables and lifecycle RPCs. This feature is disabled until the approved migration and access-control checks are complete. Monthly claims entry remains available and is not affected.</p></div>;
  }

  return <div className="space-y-6 min-w-0">
    <header className="page-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="page-title">Individual Claim Cases</h1><p className="page-description">Manage each patient claim independently from monthly insurer-level claims totals.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void refresh()} disabled={offline}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        {canWrite && <Button onClick={() => setShowCreate((value) => !value)} disabled={offline}><FilePlus2 className="mr-2 h-4 w-4" />New claim case</Button>}
      </div>
    </header>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="stat-card"><p className="text-xs text-muted-foreground">Total cases</p><p className="text-2xl font-bold">{casesError ? "Unavailable" : caseRows.length}</p></div>
      <div className="stat-card"><p className="text-xs text-muted-foreground">Open cases</p><p className="text-2xl font-bold">{casesError ? "Unavailable" : caseRows.filter((item) => !["closed", "reconciled"].includes(item.status)).length}</p></div>
      <div className="stat-card"><p className="text-xs text-muted-foreground">Awaiting insurer response</p><p className="text-2xl font-bold">{casesError ? "Unavailable" : caseRows.filter((item) => ["submitted", "acknowledged", "under_review", "queried"].includes(item.status)).length}</p></div>
    </div>

    {offline && <div role="alert" className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">Individual claim cases require an online connection. Your existing offline monthly claims workflow remains available; no offline claim-case writes are queued yet.</div>}
    {!offline && !facilityId && <div role="alert" className="rounded-lg border p-4 text-sm">An active facility must be selected before individual claims can be viewed or created. Select a facility in <Link className="text-primary underline" to="/pre-auth">Pre-Authorization</Link>, then return here.</div>}
    {casesError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"><p className="font-semibold">Individual claim-case data is unavailable</p><p>{casesError.message}</p><p className="mt-1 text-muted-foreground">The register and its totals are not being treated as empty or zero. Ask the system administrator to verify the claim-case database release and access policies.</p></div>}

    {showCreate && canWrite && !offline && <section className="stat-card space-y-4">
      <div className="flex items-center gap-2"><FilePlus2 className="h-5 w-5" /><h2 className="font-semibold">Register a new claim case</h2></div>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void createCase(event)}>
        <div className="space-y-2"><Label htmlFor="case-insurer">Insurance company *</Label><select id="case-insurer" required value={form.insurance_company_id} onChange={(event) => setForm((old) => ({ ...old, insurance_company_id: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">Select insurer</option>{insurerRows.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="case-preauth">Link pre-authorization (optional)</Label><select id="case-preauth" value={form.preauth_id} onChange={(event) => { const selected = preauthorizationRows.find((item) => item.id === event.target.value); setForm((old) => ({ ...old, preauth_id: event.target.value, insurance_company_id: selected?.insurance_company_id ?? old.insurance_company_id, date_of_service: selected?.procedure_date ?? old.date_of_service })); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">No pre-authorization link</option>{preauthorizationRows.map((item) => <option key={item.id} value={item.id}>{item.request_number || item.id.slice(0, 8)} · {item.provider_name || "Provider not specified"}</option>)}</select><p className="text-xs text-muted-foreground">Only pre-authorizations belonging to the selected facility are listed. The server also verifies that the insurer matches.</p></div>
        <div className="space-y-2"><Label htmlFor="case-patient">Patient name *</Label><Input id="case-patient" required value={form.patient_name} onChange={(event) => setForm((old) => ({ ...old, patient_name: event.target.value }))} maxLength={180} /></div>
        <div className="space-y-2"><Label htmlFor="case-member">Membership number</Label><Input id="case-member" value={form.member_number} onChange={(event) => setForm((old) => ({ ...old, member_number: event.target.value }))} maxLength={100} /></div>
        <div className="space-y-2"><Label htmlFor="case-service-date">Date of service *</Label><Input id="case-service-date" type="date" required value={form.date_of_service} onChange={(event) => setForm((old) => ({ ...old, date_of_service: event.target.value }))} /></div>
        <div className="space-y-2"><Label htmlFor="case-procedure">Procedure / service</Label><Input id="case-procedure" value={form.procedure_name} onChange={(event) => setForm((old) => ({ ...old, procedure_name: event.target.value }))} maxLength={180} /></div>
        <div className="space-y-2"><Label htmlFor="case-diagnosis">Diagnosis</Label><Input id="case-diagnosis" value={form.diagnosis} onChange={(event) => setForm((old) => ({ ...old, diagnosis: event.target.value }))} maxLength={500} /></div>
        <div className="space-y-2"><Label htmlFor="case-amount">Submitted amount *</Label><Input id="case-amount" type="number" min="0.01" step="0.01" required value={form.submitted_amount} onChange={(event) => setForm((old) => ({ ...old, submitted_amount: event.target.value }))} /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="case-notes">Clinical / submission notes</Label><Textarea id="case-notes" value={form.clinical_notes} onChange={(event) => setForm((old) => ({ ...old, clinical_notes: event.target.value }))} rows={3} maxLength={4000} /></div>
        <div className="flex flex-wrap gap-2 md:col-span-2"><Button type="submit" disabled={saving || !facilityId}>{saving ? "Saving…" : "Create draft claim"}</Button><Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button></div>
      </form>
      <p className="text-xs text-muted-foreground">A claim reference and creation event are generated by the database. This creates a separate individual case; it does not insert or alter a monthly aggregate claim, payment, WHT or ledger entry.</p>
    </section>}

    <section className="stat-card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Claim register</h2><p className="text-xs text-muted-foreground">Facility-scoped individual claims</p></div><div className="flex flex-wrap gap-2"><Input aria-label="Search claim cases" placeholder="Search reference, patient or insurer" value={search} onChange={(event) => setSearch(event.target.value)} className="sm:w-64" /><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="all">All statuses</option>{CLAIM_STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></div></div>
      {casesError ? <p className="py-8 text-center text-sm text-muted-foreground">Claim-case records cannot be displayed until the data source is available.</p> : isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading claim cases…</p> : !filteredCases.length ? <div className="rounded-md border p-8 text-center text-sm text-muted-foreground"><Activity className="mx-auto mb-2 h-6 w-6 opacity-60" />No individual claim cases match this view.</div> : <div className="space-y-3">{filteredCases.map((item) => <article key={item.id} className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{item.claim_number}</span><Badge variant={item.status === "rejected" ? "destructive" : item.status === "paid" || item.status === "closed" ? "secondary" : "outline"}>{titleCase(item.status)}</Badge></div><p className="text-sm">{item.patient_name}{item.member_number ? <span className="text-muted-foreground"> · {item.member_number}</span> : null}</p><p className="text-xs text-muted-foreground">{String(insurerById.get(item.insurance_company_id) ?? "Insurer unavailable")} · Service {item.date_of_service}{item.procedure_name ? ` · ${item.procedure_name}` : ""}</p><p className="text-sm font-medium">{money(item.submitted_amount, item.currency)} submitted{item.approved_amount != null ? ` · ${money(item.approved_amount, item.currency)} approved` : ""}{item.paid_amount > 0 ? ` · ${money(item.paid_amount, item.currency)} paid` : ""}</p>{item.denial_reason && <p className="text-xs text-destructive">Denial: {item.denial_reason}</p>}</div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedCaseId((current) => current === item.id ? null : item.id)}><History className="mr-1 h-4 w-4" />{selectedCaseId === item.id ? "Hide history" : "History"}</Button>{canWrite && getAvailableClaimTransitions(item.status).map((target) => <Button key={target} size="sm" variant={target === "rejected" || target === "closed" ? "outline" : "default"} disabled={transitioningId === item.id} onClick={() => void transitionCase(item, target)}>{transitioningId === item.id ? "Saving…" : titleCase(target)}</Button>)}</div>
        </div>
        {selectedCaseId === item.id && <div className="border-t pt-3 space-y-2"><div className="flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4" />Lifecycle history</div>{eventsError ? <p role="alert" className="text-xs text-destructive">Lifecycle history is unavailable: {eventsError.message}</p> : eventsLoading ? <p className="text-xs text-muted-foreground">Loading history…</p> : !(events ?? []).length ? <p className="text-xs text-muted-foreground">No history events found.</p> : eventRows.map((entry) => <div key={entry.id} className="flex flex-col gap-1 border-l-2 pl-3 py-1"><p className="text-sm font-medium">{entry.from_status ? `${titleCase(entry.from_status)} → ${titleCase(entry.to_status)}` : titleCase(entry.to_status)}</p><p className="text-sm text-muted-foreground">{entry.note}</p><p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()} · {entry.actor_id}</p></div>)}</div>}
      </article>)}</div>}
      {!canWrite && <p className="text-xs text-muted-foreground">Read-only access. Claims write permission is required to register or transition claim cases.</p>}
    </section>

    <section className="rounded-lg border bg-muted/20 p-4 flex items-start gap-3"><ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" /><div className="space-y-1"><p className="text-sm font-medium">Separate financial recordkeeping</p><p className="text-xs text-muted-foreground">These case records are not yet posted automatically to monthly insurer totals, payments, withholding tax or the general ledger. Financial posting and reconciliation will be a separately controlled workflow to prevent double counting.</p></div></section>
  </div>;
}
