import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Eye, Download, Pencil, Send, CheckCircle2, XCircle, Clock, Mail, History, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PreAuthForm from "@/components/preauth/PreAuthForm";
import { useSupabaseQuery, useSupabaseUpdate, useSupabaseInsert, useSupabaseBulkInsert } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import EntityDialog from "@/components/shared/EntityDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { exportPreAuthPDF } from "@/lib/exportUtils";
import { buildLetterheadConfig } from "@/lib/letterhead";
import { useAuth } from "@/contexts/AuthContext";
import BulkImportDialog from "@/components/shared/BulkImportDialog";

const statusStyles: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  PendingApproval: "bg-warning/10 text-warning border-warning/20",
  Approved: "bg-success/10 text-success border-success/20",
  Rejected: "bg-destructive/10 text-destructive border-destructive/20",
  Completed: "bg-info/10 text-info border-info/20",
  approved: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  draft: "bg-muted text-muted-foreground border-border",
  completed: "bg-info/10 text-info border-info/20",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Draft: ["PendingApproval"],
  PendingApproval: ["Approved", "Rejected", "Draft"],
  Approved: ["Completed", "Rejected"],
  Rejected: ["Draft"],
  Completed: [],
};

function normState(s?: string): string {
  if (!s) return "Draft";
  const map: Record<string, string> = {
    draft: "Draft", pending: "PendingApproval", approved: "Approved",
    rejected: "Rejected", completed: "Completed",
  };
  return map[s] || (["Draft","PendingApproval","Approved","Rejected","Completed"].includes(s) ? s : "Draft");
}

export default function PreAuthorization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingPreauth, setEditingPreauth] = useState<any>(null);
  const [viewPreauth, setViewPreauth] = useState<any>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [emailLog, setEmailLog] = useState<any[]>([]);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusForm, setStatusForm] = useState({ id: "", status: "", note: "" });
  const [sending, setSending] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: preauths, isLoading } = useSupabaseQuery("pre_authorizations");
  const { data: patients } = useSupabaseQuery("patients");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: procedures } = useSupabaseQuery("procedures");
  const { data: doctors } = useSupabaseQuery("doctors");
  const { data: settings } = useSupabaseQuery("system_settings");
  const updateMutation = useSupabaseUpdate("pre_authorizations");
  const bulkInsert = useSupabaseBulkInsert("pre_authorizations");
  const insertVersion = useSupabaseInsert("preauth_versions");
  const insertNotif = useSupabaseInsert("notifications");
  const [search, setSearch] = useState("");

  const handleDelete = async (pa: any) => {
    if (!confirm(`Delete pre-authorization for ${getPatientName(pa.patient_id)}? This removes its items, versions and email log entries.`)) return;
    try {
      await (supabase.from("preauth_items") as any).delete().eq("preauth_id", pa.id);
      await (supabase.from("preauth_versions") as any).delete().eq("preauth_id", pa.id);
      await (supabase.from("preauth_email_log") as any).delete().eq("preauth_id", pa.id);
      const { error } = await (supabase.from("pre_authorizations") as any).delete().eq("id", pa.id);
      if (error) throw error;
      toast({ title: "Pre-authorization deleted" });
      if (viewPreauth?.id === pa.id) setViewPreauth(null);
      queryClient.invalidateQueries({ queryKey: ["pre_authorizations"] });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const getPatientName = (id: string) => (patients || []).find((p: any) => p.id === id)?.patient_name || "—";
  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "—";
  const getProcedureName = (id: string) => (procedures || []).find((p: any) => p.id === id)?.procedure_name || "—";
  const getDoctorName = (id: string) => (doctors || []).find((d: any) => d.id === id)?.doctor_name || "—";

  const getS = (k: string) => settings?.find?.((s: any) => s.key === k)?.value || "";

  const companyInfo = buildLetterheadConfig(getS);

  const snapshotAndNotify = async (pa: any, newState: string, note?: string) => {
    const { data: itemsData } = await (supabase.from("preauth_items") as any).select("*").eq("preauth_id", pa.id);
    const snapshot = { ...pa, items: itemsData || [], current_state: newState };
    const nextVersion = (pa.version || 1) + 1;
    try {
      await insertVersion.mutateAsync({
        preauth_id: pa.id,
        version_number: nextVersion,
        state: newState,
        snapshot,
        change_note: note || null,
        edited_by: user?.id,
        edited_by_name: user?.email || "",
      });
    } catch {}
    try {
      await insertNotif.mutateAsync({
        user_id: user?.id,
        title: `Pre-Auth ${newState}`,
        message: `${getPatientName(pa.patient_id)} — ${getInsurerName(pa.insurance_company_id)}${note ? ` (${note})` : ""}`,
        type: "preauth",
        read: false,
      });
    } catch {}
  };

  const buildEmailDraft = (pa: any) => {
    const patient = (patients || []).find((p: any) => p.id === pa.patient_id);
    const insurer = (insurers || []).find((i: any) => i.id === pa.insurance_company_id);
    const proc = (procedures || []).find((p: any) => p.id === pa.procedure_id);
    const patientName = patient?.patient_name || "Patient";
    const membership = patient?.membership_number || "—";
    const procName = proc?.procedure_name || pa.diagnosis || "treatment";
    const procDate = pa.procedure_date || "scheduled date";
    const isFuture = pa.procedure_date && new Date(pa.procedure_date) >= new Date(new Date().toDateString());
    const verb = isFuture ? "has or is scheduled to undergo" : "has successfully undergone";
    const diagBullets = [...((pa.custom_diagnoses || []) as string[]), pa.diagnosis]
      .filter(Boolean).map((d: string) => `• ${d}`).join("\n");

    const officer = getS("officer_name") || "Claims Officer";
    const position = getS("officer_position") || "Claims Officer";
    const officerPhone = getS("officer_phone") || "";
    const senderEmail = getS("claims_sender_email") || getS("provider_email") || "";
    const hospital = getS("provider_name") || "Hospital";

    const subject = `PRE-AUTHORIZATION REQUEST – ${patientName.toUpperCase()}`;
    const body =
`Dear ${insurer?.contact_person || "Sir/Madam"},

The above-named client with membership number "${membership}" ${verb} a/an "${procName}" procedure on "${procDate}".

Initial Diagnosis:
${diagBullets || "• —"}

Kindly find attached a copy of the pre-authorization request document for your review.

Do not hesitate to reach us if you require further information.

Thank you.

${officer}
${position}
${officerPhone}
${senderEmail}
${hospital}`;

    const to = [insurer?.email].filter(Boolean).join(",");
    const cc = [
      ...((insurer?.additional_emails || []) as string[]),
      ...((getS("claims_cc_emails") || "").split(",").map((s: string) => s.trim()).filter(Boolean)),
    ].join(",");
    return { to, cc, subject, body };
  };

  const handleSendEmail = async (pa: any) => {
    setSending(true);
    try {
      const { data: itemsData } = await (supabase.from("preauth_items") as any).select("*").eq("preauth_id", pa.id);
      const docMeta = {
        ...pa,
        patient_name: getPatientName(pa.patient_id),
        insurance_name: getInsurerName(pa.insurance_company_id),
        doctor_name: getDoctorName(pa.doctor_id),
      };
      const { to, cc, subject, body } = buildEmailDraft(pa);
      await exportPreAuthPDF(docMeta, itemsData || [], companyInfo);
      const mailto = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailto, "_blank");
      toast({ title: "Email draft opened", description: "The PDF was downloaded; attach it before sending. The request was not marked as completed." });
      if (viewPreauth?.id === pa.id) await reloadTimeline(pa.id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleTransition = async (pa: any, target: string, note?: string) => {
    const current = normState(pa.current_state || pa.status);
    if (!ALLOWED_TRANSITIONS[current]?.includes(target)) {
      toast({ title: "Invalid transition", description: `${current} → ${target} is not allowed`, variant: "destructive" });
      return;
    }
    const updates: any = {
      id: pa.id, current_state: target,
      status: target === "PendingApproval" ? "pending" : target.toLowerCase(),
    };
    if (target === "Approved") { updates.approved_at = new Date().toISOString(); updates.approved_by = user?.id; }
    if (target === "Rejected" && note) updates.rejection_reason = note;
    if (target === "PendingApproval") updates.submitted_at = new Date().toISOString();
    try {
      await updateMutation.mutateAsync(updates);
      await snapshotAndNotify({ ...pa, ...updates }, target, note);
      toast({ title: `Moved to ${target}` });
      if (viewPreauth?.id === pa.id) await reloadTimeline(pa.id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const reloadTimeline = async (id: string) => {
    const { data: v } = await (supabase.from("preauth_versions") as any).select("*").eq("preauth_id", id).order("version_number", { ascending: false });
    setVersions(v || []);
    const { data: e } = await (supabase.from("preauth_email_log") as any).select("*").eq("preauth_id", id).order("created_at", { ascending: false });
    setEmailLog(e || []);
  };

  const handleView = async (pa: any) => {
    setViewPreauth(pa);
    const { data } = await (supabase.from("preauth_items") as any).select("*").eq("preauth_id", pa.id);
    setViewItems(data || []);
    await reloadTimeline(pa.id);
  };

  const handleExportPDF = async () => {
    if (!viewPreauth) return;
    await exportPreAuthPDF({
      ...viewPreauth,
      patient_name: getPatientName(viewPreauth.patient_id),
      insurance_name: getInsurerName(viewPreauth.insurance_company_id),
      doctor_name: getDoctorName(viewPreauth.doctor_id),
    }, viewItems, companyInfo);
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const pa = (preauths || []).find((p: any) => p.id === statusForm.id);
    if (!pa) return;
    await handleTransition(pa, statusForm.status, statusForm.note);
    setStatusDialogOpen(false);
  };

  if (showForm || editingPreauth) {
    return <PreAuthForm onBack={() => { setShowForm(false); setEditingPreauth(null); }} editData={editingPreauth} />;
  }

  if (viewPreauth) {
    const cur = normState(viewPreauth.current_state || viewPreauth.status);
    const allowed = ALLOWED_TRANSITIONS[cur] || [];
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setViewPreauth(null)}>← Back</Button>
          <div className="flex-1">
            <h1 className="page-title">Pre-Authorization Details <span className="text-sm text-muted-foreground font-normal">v{viewPreauth.version || 1}</span></h1>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportPDF}><Download className="w-4 h-4" />Export PDF</Button>
          <Button className="gap-2" onClick={() => { setViewPreauth(null); setEditingPreauth(viewPreauth); }}><Pencil className="w-4 h-4" />Edit</Button>
          <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => handleDelete(viewPreauth)}><Trash2 className="w-4 h-4" />Delete</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="stat-card"><p className="text-xs text-muted-foreground">Patient</p><p className="font-semibold mt-1">{getPatientName(viewPreauth.patient_id)}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Insurance</p><p className="font-semibold mt-1">{getInsurerName(viewPreauth.insurance_company_id)}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Doctor</p><p className="font-semibold mt-1">{getDoctorName(viewPreauth.doctor_id)}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Procedure</p><p className="font-semibold mt-1">{getProcedureName(viewPreauth.procedure_id)}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Diagnosis</p><p className="font-semibold mt-1">{viewPreauth.diagnosis || "—"}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">State</p>
            <Badge variant="outline" className={`mt-1 ${statusStyles[cur] || ""}`}>{cur}</Badge>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Cost Breakdown</h3>
          <table className="data-table">
            <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price (GH¢)</th><th>Amount (GH¢)</th></tr></thead>
            <tbody>
              {viewItems.map((item: any, i: number) => (
                <tr key={item.id}>
                  <td>{i + 1}</td>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{Number(item.unit_price).toLocaleString()}</td>
                  <td className="font-semibold">{Number(item.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={4} className="text-right">Total</td>
                <td className="text-primary">GH¢ {Number(viewPreauth.total_cost || 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" onClick={() => { setStatusForm({ id: viewPreauth.id, status: allowed[0] || cur, note: "" }); setStatusDialogOpen(true); }} disabled={allowed.length === 0}>
            Change State
          </Button>
          {allowed.includes("PendingApproval") && (
            <Button variant="outline" className="gap-2" onClick={() => handleTransition(viewPreauth, "PendingApproval")}>
              <Send className="w-4 h-4 text-warning" />Submit for Approval
            </Button>
          )}
          {allowed.includes("Approved") && (
            <Button variant="outline" className="gap-2" onClick={() => handleTransition(viewPreauth, "Approved")}>
              <CheckCircle2 className="w-4 h-4 text-success" />Approve
            </Button>
          )}
          {allowed.includes("Rejected") && (
            <Button variant="outline" className="gap-2" onClick={() => { setStatusForm({ id: viewPreauth.id, status: "Rejected", note: "" }); setStatusDialogOpen(true); }}>
              <XCircle className="w-4 h-4 text-destructive" />Reject
            </Button>
          )}
          {(cur === "Approved" || cur === "Completed") && (
            <Button className="gap-2" onClick={() => handleSendEmail(viewPreauth)} disabled={sending}>
              <Mail className="w-4 h-4" />{sending ? "Sending..." : "Send Email to Insurer"}
            </Button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="stat-card">
            <h3 className="font-heading font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4" />Version History</h3>
            {versions.length === 0 ? <p className="text-sm text-muted-foreground">No prior versions yet. Versions are created on each state change.</p> : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {versions.map(v => (
                  <li key={v.id} className="text-xs border-l-2 border-primary/40 pl-3 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">v{v.version_number} · <Badge variant="outline" className={statusStyles[v.state] || ""}>{v.state}</Badge></span>
                      <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-muted-foreground">By {v.edited_by_name || "system"}{v.change_note ? ` — ${v.change_note}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="stat-card">
            <h3 className="font-heading font-semibold mb-3 flex items-center gap-2"><Mail className="w-4 h-4" />Email Delivery Log</h3>
            {emailLog.length === 0 ? <p className="text-sm text-muted-foreground">No email attempts yet.</p> : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {emailLog.map(e => (
                  <li key={e.id} className="text-xs border-l-2 border-info/40 pl-3 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{e.to_email}</span>
                      <Badge variant="outline" className={e.status === "sent" ? "bg-success/10 text-success border-success/20" : e.status === "failed" ? "bg-destructive/10 text-destructive border-destructive/20" : ""}>{e.status}</Badge>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(e.created_at).toLocaleString()}</div>
                    {e.error_message && <div className="text-destructive mt-0.5">{e.error_message}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <EntityDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen} title="Change State">
          <form onSubmit={handleStatusUpdate} className="space-y-4">
            <div>
              <Label>Next State</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}>
                {(ALLOWED_TRANSITIONS[normState(viewPreauth?.current_state || viewPreauth?.status)] || []).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={statusForm.note} onChange={(e) => setStatusForm({ ...statusForm, note: e.target.value })} className="mt-1" />
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>Update</Button>
          </form>
        </EntityDialog>
      </div>
    );
  }

  const filtered = (preauths || []).filter((pa: any) =>
    getPatientName(pa.patient_id).toLowerCase().includes(search.toLowerCase()) ||
    getInsurerName(pa.insurance_company_id).toLowerCase().includes(search.toLowerCase())
  );

  const countByState = (s: string) => (preauths || []).filter((p: any) => normState(p.current_state || p.status) === s).length;

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Pre-Authorization Requests</h1>
          <p className="page-description">Draft → Pending → Approved → Completed lifecycle with versioning and email tracking</p>
        </div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />Import</Button><Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="w-4 h-4" />New Request</Button></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading">{(preauths || []).length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-muted-foreground">{countByState("Draft")}</p>
          <p className="text-xs text-muted-foreground mt-1">Draft</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-warning">{countByState("PendingApproval")}</p>
          <p className="text-xs text-muted-foreground mt-1">Pending</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-success">{countByState("Approved")}</p>
          <p className="text-xs text-muted-foreground mt-1">Approved</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-info">{countByState("Completed")}</p>
          <p className="text-xs text-muted-foreground mt-1">Completed</p>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by patient or insurance..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Patient</th><th>Insurance</th><th>Procedure</th><th>Total</th><th>State</th><th>v</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((pa: any) => {
                const cur = normState(pa.current_state || pa.status);
                return (
                  <tr key={pa.id} className="hover:bg-muted/50 transition-colors">
                    <td className="font-medium">{getPatientName(pa.patient_id)}</td>
                    <td>{getInsurerName(pa.insurance_company_id)}</td>
                    <td>{getProcedureName(pa.procedure_id)}</td>
                    <td className="font-semibold">GH¢ {Number(pa.total_cost || 0).toLocaleString()}</td>
                    <td><Badge variant="outline" className={statusStyles[cur] || ""}>{cur}</Badge></td>
                    <td className="text-muted-foreground">v{pa.version || 1}</td>
                    <td className="text-muted-foreground">{pa.procedure_date || "—"}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleView(pa)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-4 h-4 text-muted-foreground" /></button>
                        <button onClick={() => setEditingPreauth(pa)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                        <button onClick={() => handleDelete(pa)} className="p-1.5 rounded hover:bg-destructive/10" title="Delete"><Trash2 className="w-4 h-4 text-destructive" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No pre-authorizations. Click "New Request" to create one.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Pre-Authorization Requests"
        description="Imports parent requests and their references. Cost breakdown items can be added by editing the imported request afterward."
        columns={[
          { key: "patient_id", label: "Patient", required: true, type: "lookup", options: (patients || []).map((p: any) => ({ label: p.patient_name, value: p.id })) },
          { key: "insurance_company_id", label: "Insurance Company", type: "lookup", options: (insurers || []).map((i: any) => ({ label: i.company_name, value: i.id })) },
          { key: "procedure_id", label: "Procedure", type: "lookup", options: (procedures || []).map((p: any) => ({ label: p.procedure_name, value: p.id })) },
          { key: "doctor_id", label: "Doctor", type: "lookup", options: (doctors || []).map((d: any) => ({ label: d.doctor_name, value: d.id })) },
          { key: "procedure_date", label: "Procedure Date", type: "date" },
          { key: "total_cost", label: "Total Cost (GH¢)", type: "number" },
          { key: "diagnosis", label: "Diagnosis" },
          { key: "clinical_notes", label: "Clinical Notes" },
          { key: "status", label: "Status", example: "draft", hint: "draft, pending, approved, rejected or completed" },
        ]}
        onImport={async (rows) => {
          const payload = rows.map((row) => {
            const state = normState(row.status || "Draft");
            return {
              patient_id: row.patient_id,
              insurance_company_id: row.insurance_company_id || null,
              procedure_id: row.procedure_id || null,
              doctor_id: row.doctor_id || null,
              procedure_date: row.procedure_date || null,
              total_cost: row.total_cost ?? 0,
              diagnosis: row.diagnosis || null,
              clinical_notes: row.clinical_notes || null,
              status: state === "PendingApproval" ? "pending" : state.toLowerCase(),
              current_state: state,
              version: 1,
              created_by: user?.id || null,
            };
          });
          await bulkInsert.mutateAsync(payload);
        }}
      />
    </div>
  );
}
