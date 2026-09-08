import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, FileCheck2, Mail, Plus, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseInsert, useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { buildPreAuthEmail, buildRequestNumber, itemAmount, totalItems, type PreAuthStudioItem } from "@/modules/authorization/preauth-studio";
import { downloadPreAuthPdf, downloadPreAuthPdfFromSnapshot, type PreAuthPdfData } from "@/modules/authorization/preauth-document";
import { assertPreAuthSnapshotMatchesReviewInput } from "@/modules/authorization/preauth-integrity";
import { validatePreAuthReview, type PreAuthReviewInput } from "@/modules/authorization/preauth-review";
import { buildPreAuthSubmissionPackage, type PreAuthSubmissionPackage } from "@/modules/authorization/preauth-submission";

const blankItem = (): PreAuthStudioItem => ({ id: crypto.randomUUID(), category: "procedure", description: "", quantity: 1, unitPrice: 0 });

export default function PreAuthorizationStudio() {
  const { user } = useAuth();
  const { data: patients } = useSupabaseQuery("patients");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: doctors } = useSupabaseQuery("doctors");
  const { data: procedures } = useSupabaseQuery("procedures");
  const { data: diagnoses } = useSupabaseQuery("diagnosis_codes");
  const { data: catalog } = useSupabaseQuery("preauth_catalog_items");
  const { data: tariffs } = useSupabaseQuery("preauth_insurer_tariffs");
  const { data: settings } = useSupabaseQuery("system_settings");
  const insertPreauth = useSupabaseInsert("pre_authorizations");

  const [patientId, setPatientId] = useState("");
  const [insurerId, setInsurerId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [procedureDate, setProcedureDate] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [format, setFormat] = useState<"ghana" | "international">("ghana");
  const [currency, setCurrency] = useState("GH¢");
  const [items, setItems] = useState<PreAuthStudioItem[]>([blankItem()]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedId, setSavedId] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [warningsConfirmed, setWarningsConfirmed] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([]);

  const selectedPatient = (patients || []).find((p: any) => p.id === patientId);
  const selectedInsurer = (insurers || []).find((i: any) => i.id === insurerId);
  const selectedDoctor = (doctors || []).find((d: any) => d.id === doctorId);
  const selectedProcedure = (procedures || []).find((p: any) => p.id === procedureId);
  const getSetting = (key: string) => settings?.find?.((s: any) => s.key === key)?.value || "";
  const providerName = getSetting("provider_name") || "MT. CARMEL HOSPITAL AND FERTILITY CENTER";
  const providerAddress = getSetting("provider_address") || "Loc: Community 25 Tema. P.O. Box 3618 Tema comm 1.";
  const providerPhone = getSetting("provider_phone") || "+233 242 160 557 / +233 303 939 896";
  const providerLogoUrl = getSetting("provider_logo_url");
  const effectivePatientName = selectedPatient?.patient_name || "Patient";
  const membershipNumber = selectedPatient?.membership_number || "";
  const effectiveProcedure = selectedProcedure?.procedure_name || "Procedure";
  const today = new Date().toISOString().slice(0, 10);
  const issuedDate = new Date().toLocaleDateString("en-GB");
  const requestNumber = savedId ? buildRequestNumber(savedId) : "Generated on save";
  const total = useMemo(() => totalItems(items), [items]);

  const getTariff = (procedureRef?: string, catalogRef?: string) => {
    const match = (tariffs || []).find((t: any) => t.insurance_company_id === insurerId && (procedureRef ? t.procedure_id === procedureRef : t.catalog_item_id === catalogRef) && t.is_active !== false && (!t.effective_from || t.effective_from <= (procedureDate || today)) && (!t.effective_to || t.effective_to >= (procedureDate || today)));
    return match ? Number(match.negotiated_unit_price) : null;
  };

  const selectProcedure = (id: string) => {
    setProcedureId(id);
    const procedure = (procedures || []).find((p: any) => p.id === id);
    if (!procedure) return;
    const override = getTariff(id);
    setItems([{ ...blankItem(), description: procedure.procedure_name, unitPrice: override ?? (Number(procedure.default_tariff) || 0) }]);
  };

  const selectCatalogItem = (id: string, itemId: string) => {
    const item = (catalog || []).find((c: any) => c.id === itemId);
    if (!item) return;
    const override = getTariff(undefined, item.id);
    setItems((current) => current.map((row) => row.id === id ? { ...row, description: item.item_name, unitPrice: override ?? (Number(item.unit_price) || 0) } : row));
  };

  const pdfData = (finalRequestNumber = requestNumber): PreAuthPdfData => ({
    requestNumber: savedId ? finalRequestNumber : undefined,
    issuedDate,
    patientName: effectivePatientName,
    membershipNumber,
    patientPhone: patientPhone || selectedPatient?.phone || "",
    companyName: companyName || selectedInsurer?.company_name || "",
    providerName,
    providerAddress,
    providerPhone,
    doctorName: selectedDoctor?.doctor_name || "",
    procedureName: effectiveProcedure,
    procedureDate,
    diagnosis,
    currency,
    format,
    logoUrl: providerLogoUrl || undefined,
  });

  const email = useMemo(() => buildPreAuthEmail({
    patientName: effectivePatientName,
    membershipNumber,
    procedureName: effectiveProcedure,
    procedureDate,
    diagnosis,
    insurerName: selectedInsurer?.company_name || "Insurance Partner",
    insurerContactPerson: selectedInsurer?.contact_person,
    providerName,
    providerEmail: getSetting("provider_email"),
    officerName: getSetting("officer_name"),
    officerPosition: getSetting("officer_position"),
    officerPhone: getSetting("officer_phone"),
    senderEmail: getSetting("claims_sender_email"),
  }), [effectivePatientName, membershipNumber, effectiveProcedure, procedureDate, diagnosis, selectedInsurer, providerName, settings]);

  const reviewInput = useMemo<PreAuthReviewInput>(() => ({
    patientId,
    patientName: effectivePatientName,
    membershipNumber,
    insurerId,
    insurerName: selectedInsurer?.company_name || "",
    procedureId,
    procedureName: effectiveProcedure,
    procedureDate,
    diagnosis,
    doctorName: selectedDoctor?.doctor_name || "",
    patientPhone: patientPhone || selectedPatient?.phone || "",
    companyName: companyName || selectedInsurer?.company_name || "",
    insurerEmail: selectedInsurer?.email || "",
    providerEmail: getSetting("provider_email"),
    providerName,
    providerAddress,
    providerPhone,
    providerLogoUrl,
    issuedDate,
    currency,
    format,
    items,
  }), [patientId, effectivePatientName, membershipNumber, insurerId, selectedInsurer, procedureId, effectiveProcedure, procedureDate, diagnosis, selectedDoctor, patientPhone, selectedPatient, companyName, providerName, providerAddress, providerPhone, providerLogoUrl, issuedDate, currency, format, items, settings]);

  const review = useMemo(() => validatePreAuthReview(reviewInput), [reviewInput]);
  const duplicateSignature = [patientId, membershipNumber.trim().toUpperCase(), procedureId, procedureDate, insurerId].join("|");

  const saveDraft = async (): Promise<string | null> => {
    if (!patientId || !insurerId || !procedureDate || !procedureId) {
      toast({ title: "Required information missing", description: "Patient, insurer, procedure, and procedure date are required.", variant: "destructive" });
      return null;
    }
    setSaving(true);
    try {
      const payload = {
        patient_id: patientId, insurance_company_id: insurerId, doctor_id: doctorId || null, procedure_id: procedureId,
        procedure_date: procedureDate, diagnosis: diagnosis || null, total_cost: total, provider_name: providerName,
        provider_address: providerAddress, provider_phone: providerPhone, status: "draft", current_state: "Draft",
        created_by: user?.id || null, client_company_name: companyName || selectedInsurer?.company_name || null,
        patient_phone: patientPhone || selectedPatient?.phone || null, clinical_notes: notes || null,
        document_format: format, document_currency: currency, duplicate_signature: duplicateSignature,
      };
      const created = await insertPreauth.mutateAsync(payload);
      const id = created.id as string;
      const rows = items.filter((item) => item.description.trim()).map((item) => ({ preauth_id: id, description: item.description.trim(), quantity: Math.max(0, Number(item.quantity) || 0), unit_price: Math.max(0, Number(item.unitPrice) || 0), amount: itemAmount(item), category: item.category }));
      if (rows.length) {
        const { error } = await (supabase.from("preauth_items") as any).insert(rows);
        if (error) throw error;
      }
      setSavedId(id);
      toast({ title: "Draft saved", description: `Request ${buildRequestNumber(id)} is ready for review.` });
      return id;
    } catch (error: any) {
      toast({ title: "Unable to save draft", description: error.message || "Please try again.", variant: "destructive" });
      return null;
    } finally { setSaving(false); }
  };

  const reviewRequest = async () => {
    const id = savedId || await saveDraft();
    if (!id) return;
    const { data } = await (supabase.from("pre_authorizations") as any)
      .select("id,request_number,status,current_state,procedure_date,duplicate_signature")
      .eq("duplicate_signature", duplicateSignature)
      .neq("id", id)
      .in("status", ["draft", "prepared"])
      .order("created_at", { ascending: false })
      .limit(5);
    setDuplicateMatches(data || []);
    setWarningsConfirmed(false);
    setReviewOpen(true);
  };

  const openEmail = () => {
    const to = selectedInsurer?.email || "";
    const cc = [...((selectedInsurer?.additional_emails || []) as string[]), ...(getSetting("claims_cc_emails") || "").split(",").map((x: string) => x.trim()).filter(Boolean)].join(",");
    window.open(`mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`, "_blank");
  };

  const openPreparedEmail = (submissionPackage: PreAuthSubmissionPackage) => {
    const to = submissionPackage.recipients.find((recipient) => recipient.type === "to")?.email || "";
    const cc = submissionPackage.recipients.filter((recipient) => recipient.type === "cc").map((recipient) => recipient.email).join(",");
    window.open(`mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(submissionPackage.subject)}&body=${encodeURIComponent(submissionPackage.messageBody)}`, "_blank");
  };

  const finalizeRequest = async () => {
    const id = savedId || await saveDraft();
    if (!id) return;
    if (!review.ready) {
      setReviewOpen(true);
      toast({ title: "Resolve blocking errors", description: `${review.errors.length} blocking issue(s) must be corrected before preparation.`, variant: "destructive" });
      return;
    }
    if (review.warnings.length && !warningsConfirmed) {
      setReviewOpen(true);
      toast({ title: "Confirm review warnings", description: "Review the warnings and explicitly confirm them before preparation.", variant: "destructive" });
      return;
    }
    if (duplicateMatches.length) {
      toast({ title: "Possible duplicate request", description: "Review the existing matching requests before creating another request.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data: latest } = await (supabase.from("preauthorization_versions") as any)
        .select("version_number")
        .eq("preauth_id", id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const versionNumber = Number(latest?.version_number || 0) + 1;
      const finalRequestNumber = buildRequestNumber(id);
      const submissionPackage = buildPreAuthSubmissionPackage({
        preauthId: id,
        versionNumber,
        requestNumber: finalRequestNumber,
        reviewInput,
        subject: email.subject,
        messageBody: email.body,
        insurerEmail: selectedInsurer?.email,
        insurerName: selectedInsurer?.company_name,
        additionalEmails: selectedInsurer?.additional_emails,
        ccEmails: (getSetting("claims_cc_emails") || "").split(",").map((value: string) => value.trim()).filter(Boolean),
      });
      if (!submissionPackage.recipients.some((recipient) => recipient.type === "to")) {
        throw new Error("The insurer does not have a valid email address for the authorization request.");
      }
      assertPreAuthSnapshotMatchesReviewInput(submissionPackage.snapshot, reviewInput);

      const { data: version, error: versionError } = await (supabase.from("preauthorization_versions") as any)
        .insert({ preauth_id: id, version_number: versionNumber, snapshot: submissionPackage.snapshot, total_cost: review.total, created_by: user?.id || null })
        .select("id")
        .single();
      if (versionError) throw versionError;

      await downloadPreAuthPdfFromSnapshot(submissionPackage.snapshot);

      const now = new Date().toISOString();
      const { data: submission, error: submissionError } = await (supabase.from("preauthorization_submissions") as any)
        .insert({
          preauth_id: id,
          version_id: version.id,
          idempotency_key: submissionPackage.idempotencyKey,
          submission_channel: "email",
          status: "prepared",
          recipient_manifest: submissionPackage.recipients,
          attachment_manifest: submissionPackage.attachments,
          subject: submissionPackage.subject,
          message_body: submissionPackage.messageBody,
          submitted_by: user?.id || null,
          prepared_at: now,
        })
        .select("id")
        .single();
      if (submissionError) throw submissionError;

      const { error: parentError } = await (supabase.from("pre_authorizations") as any).update({
        document_revision: versionNumber,
        document_payload: submissionPackage.snapshot,
        document_finalized_at: now,
        status: "prepared",
        current_state: "Email handoff prepared",
      }).eq("id", id);
      if (parentError) throw parentError;

      await (supabase.from("preauthorization_audit_events") as any).insert({
        preauth_id: id,
        version_id: version.id,
        submission_id: submission.id,
        event_type: "email_handoff_prepared",
        event_data: { versionNumber, recipientCount: submissionPackage.recipients.length, attachmentCount: submissionPackage.attachments.length },
        actor_id: user?.id || null,
      });

      setSavedId(id);
      setReviewOpen(false);
      openPreparedEmail(submissionPackage);
      toast({ title: "Authorization request prepared", description: `${finalRequestNumber} revision ${versionNumber} is frozen and recorded. The PDF and email are ready for your final review and send.` });
    } catch (error: any) {
      toast({ title: "Request preparation failed", description: error.message || "The request could not be frozen and prepared.", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const copyEmail = async () => { await navigator.clipboard.writeText(email.body); toast({ title: "Email copied", description: "The professional insurer email draft is on your clipboard." }); };

  return (
    <div className="space-y-6 max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2"><FileCheck2 className="h-6 w-6 text-primary" /><h1 className="page-title">Pre-Authorization Studio</h1><Badge variant="outline">Document-first workflow</Badge></div><p className="page-description">Create once, edit safely, preview, save a unique request, then freeze the request and prepare the final email package for the selected insurance partner.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => downloadPreAuthPdf(pdfData(), items)} className="gap-2"><Download className="h-4 w-4" /> Preview / PDF</Button><Button variant="outline" onClick={reviewRequest} disabled={saving || submitting} className="gap-2"><FileCheck2 className="h-4 w-4" /> Review request</Button><Button onClick={saveDraft} disabled={saving || submitting} className="gap-2"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save draft"}</Button></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
        <div className="space-y-5">
          <section className="stat-card space-y-4">
            <div className="flex items-center justify-between"><div><h2 className="font-heading font-semibold">1. Request information</h2><p className="text-xs text-muted-foreground">Only information that changes per request is entered here.</p></div><select className="h-9 rounded-md border bg-background px-3 text-sm" value={format} onChange={(e) => setFormat(e.target.value as "ghana" | "international")}><option value="ghana">Ghana facility format</option><option value="international">International request format</option></select></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Patient / Client *</Label><select className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm" value={patientId} onChange={(e) => setPatientId(e.target.value)}><option value="">Select patient</option>{(patients || []).map((p: any) => <option key={p.id} value={p.id}>{p.patient_name} {p.membership_number ? `— ${p.membership_number}` : ""}</option>)}</select></div>
              <div><Label>Insurance partner *</Label><select className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm" value={insurerId} onChange={(e) => setInsurerId(e.target.value)}><option value="">Select insurer</option>{(insurers || []).filter((i: any) => i.is_active !== false).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}</select></div>
              <div><Label>Doctor / Surgeon</Label><select className="mt-1 w-full h-9 rounded-md border bg-background px-3 py-2 text-sm" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">Select provider</option>{(doctors || []).map((d: any) => <option key={d.id} value={d.id}>{d.doctor_name}</option>)}</select></div>
              <div><Label>Procedure *</Label><select className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm" value={procedureId} onChange={(e) => selectProcedure(e.target.value)}><option value="">Select procedure</option>{(procedures || []).map((p: any) => <option key={p.id} value={p.id}>{p.procedure_name}</option>)}</select></div>
              <div><Label>Procedure date *</Label><Input className="mt-1" type="date" value={procedureDate} onChange={(e) => setProcedureDate(e.target.value)} /></div>
              <div><Label>Patient telephone</Label><Input className="mt-1" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="Optional override" /></div>
              <div><Label>Company / employer</Label><Input className="mt-1" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="As shown on card / policy" /></div>
              <div><Label>Currency</Label><Input className="mt-1" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder={format === "ghana" ? "GH¢" : "USD"} /></div>
              <div className="md:col-span-2"><Label>Diagnosis</Label><select className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}><option value="">Select diagnosis</option>{(diagnoses || []).map((d: any) => <option key={d.id} value={`${d.code} - ${d.description}`}>{d.code} — {d.description}</option>)}</select></div>
              <div className="md:col-span-2"><Label>Additional notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical or administrative notes to retain with the draft." /></div>
            </div>
          </section>

          <section className="stat-card space-y-4">
            <div className="flex items-center justify-between"><div><h2 className="font-heading font-semibold">2. Services and charges</h2><p className="text-xs text-muted-foreground">Tariffs are editable. Insurer-specific negotiated tariffs are applied when configured.</p></div><Button variant="outline" size="sm" onClick={() => setItems((rows) => [...rows, blankItem()])} className="gap-2"><Plus className="h-4 w-4" /> Add line</Button></div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Category</th><th className="p-2 text-left">Description</th><th className="p-2 w-24">Qty</th><th className="p-2 w-36">Unit</th><th className="p-2 w-36 text-right">Amount</th><th className="w-10" /></tr></thead><tbody>
              {items.map((item) => <tr key={item.id} className="border-b align-top"><td className="p-2"><select className="h-9 rounded-md border bg-background px-2" value={item.category} onChange={(e) => setItems((rows) => rows.map((r) => r.id === item.id ? { ...r, category: e.target.value as PreAuthStudioItem["category"] } : r))}><option value="procedure">Procedure</option><option value="laboratory">Laboratory</option><option value="drugs">Drugs</option><option value="accommodation">Accommodation</option><option value="other">Other</option></select></td><td className="p-2 min-w-[240px]"><Input value={item.description} onChange={(e) => setItems((rows) => rows.map((r) => r.id === item.id ? { ...r, description: e.target.value } : r))} placeholder="Description" /><select className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs" onChange={(e) => selectCatalogItem(item.id, e.target.value)}><option value="">Optional catalog tariff</option>{(catalog || []).filter((c: any) => !c.archived).map((c: any) => <option key={c.id} value={c.id}>{c.item_name}</option>)}</select></td><td className="p-2"><Input type="number" min="0" step="1" value={item.quantity} onChange={(e) => setItems((rows) => rows.map((r) => r.id === item.id ? { ...r, quantity: Number(e.target.value) } : r))} /></td><td className="p-2"><Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setItems((rows) => rows.map((r) => r.id === item.id ? { ...r, unitPrice: Number(e.target.value) } : r))} /></td><td className="p-2 text-right font-medium">{currency} {itemAmount(item).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td className="p-2"><Button variant="ghost" size="icon" onClick={() => setItems((rows) => rows.length === 1 ? rows : rows.filter((r) => r.id !== item.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>)}
            </tbody><tfoot><tr><td colSpan={4} className="p-3 text-right font-bold">TOTAL</td><td className="p-3 text-right font-bold">{currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td /></tr></tfoot></table></div>
          </section>

          {reviewOpen && <section className="stat-card space-y-4 border-primary/30"><div className="flex items-start justify-between gap-4"><div><h2 className="font-heading font-semibold">3. Review & freeze revision</h2><p className="text-xs text-muted-foreground">Preparation is blocked until all errors are resolved. Warnings require explicit confirmation.</p></div><Badge variant={review.ready ? "default" : "destructive"}>{review.ready ? "Ready for review" : "Action required"}</Badge></div>
            {review.errors.length > 0 && <div className="space-y-2"><div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> Blocking errors</div>{review.errors.map((item) => <div key={`${item.field}-${item.message}`} className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm">{item.message}</div>)}</div>}
            {review.warnings.length > 0 && <div className="space-y-2"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Review warnings</div>{review.warnings.map((item) => <div key={`${item.field}-${item.message}`} className="rounded-md border bg-muted/20 p-2 text-sm">{item.message}</div>)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={warningsConfirmed} onChange={(e) => setWarningsConfirmed(e.target.checked)} /> I have reviewed and confirm these warnings.</label></div>}
            {review.errors.length === 0 && review.warnings.length === 0 && <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-3 text-sm"><CheckCircle2 className="h-4 w-4" /> All required review checks passed.</div>}
            {duplicateMatches.length > 0 && <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"><div className="font-semibold">Possible duplicate request detected</div><div className="mt-1 text-muted-foreground">Matching client, membership, insurer, procedure and procedure date already exist. Review the existing request before preparing another request.</div><div className="mt-2 space-y-1">{duplicateMatches.map((match) => <div key={match.id} className="font-mono text-xs">{match.request_number || match.id} · {match.status} · {match.current_state || "—"}</div>)}</div></div>}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3"><div><div className="text-xs uppercase tracking-wide text-muted-foreground">Final amount</div><div className="text-lg font-bold">{currency} {review.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div><Button onClick={finalizeRequest} disabled={submitting || !review.ready || (review.warnings.length > 0 && !warningsConfirmed) || duplicateMatches.length > 0} className="gap-2"><Send className="h-4 w-4" /> {submitting ? "Freezing & preparing…" : "Freeze & prepare email"}</Button></div>
          </section>}

          <section className="stat-card"><div className="flex items-center justify-between gap-3"><div><h2 className="font-heading font-semibold">4. Submission email</h2><p className="text-xs text-muted-foreground">The wording changes automatically according to the procedure date. The final email package uses the frozen revision snapshot.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={copyEmail} className="gap-2"><Copy className="h-4 w-4" /> Copy</Button><Button size="sm" onClick={openEmail} className="gap-2"><Mail className="h-4 w-4" /> Open email</Button></div></div><div className="mt-4 rounded-md border bg-muted/30 p-4 space-y-3"><div className="text-xs text-muted-foreground">To: {selectedInsurer?.email || "Select an insurer"} · Subject: {email.subject}</div><pre className="whitespace-pre-wrap font-sans text-sm leading-6">{email.body}</pre></div></section>
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start"><div className="rounded-lg border bg-white shadow-sm overflow-hidden"><div className="flex items-center justify-between border-b bg-muted/30 p-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Live document preview</p><p className="font-semibold">{requestNumber}</p></div><Badge variant="outline">{format === "ghana" ? "GHANA" : "INTERNATIONAL"}</Badge></div><div className="p-5 text-[10px] leading-4"><div className="border-b-2 border-primary pb-3 text-center"><div className="text-sm font-bold">{providerName}</div><div>{providerAddress}</div><div>Tel: {providerPhone}</div><div className="mt-2 text-base font-bold">PRE-AUTHORIZATION REQUEST</div><div className="mt-1 flex justify-between"><span>{requestNumber}</span><span>{issuedDate}</span></div></div><div className="grid grid-cols-2 gap-1 mt-3"><div className="border p-2"><b>NAME:</b> {effectivePatientName}</div><div className="border p-2"><b>COMPANY:</b> {companyName || selectedInsurer?.company_name || "—"}</div><div className="border p-2"><b>MEMBERSHIP #:</b> {membershipNumber || "—"}</div><div className="border p-2"><b>PATIENT TEL:</b> {patientPhone || selectedPatient?.phone || "—"}</div><div className="border p-2"><b>PROVIDER:</b> {providerName}</div><div className="border p-2"><b>DOCTOR:</b> {selectedDoctor?.doctor_name || "—"}</div><div className="border p-2"><b>PROCEDURE:</b> {effectiveProcedure}</div><div className="border p-2"><b>PROCEDURE DATE:</b> {procedureDate || "—"}</div><div className="border p-2 col-span-2"><b>DIAGNOSIS:</b> {diagnosis || "—"}</div></div><div className="mt-3 overflow-hidden border"><div className="grid grid-cols-[1fr_45px_75px_75px] bg-primary/15 font-bold"><div className="p-2">Description</div><div className="p-2">Qty</div><div className="p-2">Unit</div><div className="p-2">Amount</div></div>{items.filter((i) => i.description).map((i) => <div key={i.id} className="grid grid-cols-[1fr_45px_75px_75px] border-t"><div className="p-2">{i.description}</div><div className="p-2">{i.quantity}</div><div className="p-2 text-right">{currency} {i.unitPrice.toFixed(2)}</div><div className="p-2 text-right">{currency} {itemAmount(i).toFixed(2)}</div></div>)}<div className="grid grid-cols-[1fr_120px_75px] border-t font-bold"><div className="p-2 col-span-2 text-right">TOTAL</div><div className="p-2 text-right">{currency} {total.toFixed(2)}</div></div></div></div></div><div className="mt-3 rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground"><b className="text-foreground">Request preparation safeguard:</b> save a draft, review the request, resolve blocking errors, confirm warnings, then freeze the exact revision before handoff. The system records the frozen revision, recipients, attachment manifest and preparation audit event. The officer remains responsible for sending the email.</div></aside>
      </div>
    </div>
  );
}