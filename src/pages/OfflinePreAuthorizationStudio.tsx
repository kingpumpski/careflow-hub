import { useMemo, useState } from "react";
import { Download, FileCheck2, Mail, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { buildPreAuthEmail, buildRequestNumber, itemAmount, totalItems, type PreAuthStudioItem } from "@/modules/authorization/preauth-studio";
import { downloadPreAuthPdfFromSnapshot } from "@/modules/authorization/preauth-document";
import { assertPreAuthSnapshotMatchesReviewInput } from "@/modules/authorization/preauth-integrity";
import { buildDuplicateSignature, buildPreAuthDocumentPayload, validatePreAuthReview, type PreAuthReviewInput } from "@/modules/authorization/preauth-review";
import { buildPreAuthRecipientManifest, buildPreAuthSubmissionPackageFromSnapshot, type PreAuthSubmissionPackage } from "@/modules/authorization/preauth-submission";
import { createOfflinePreAuthDataProvider } from "@/modules/offline/preauth-data-provider";
import { OfflineDataControls } from "@/components/preauth/OfflineDataControls";

const blankItem = (): PreAuthStudioItem => ({ id: crypto.randomUUID(), category: "procedure", description: "", quantity: 1, unitPrice: 0 });

export default function OfflinePreAuthorizationStudio() {
  const { user } = useAuth();
  const provider = useMemo(() => createOfflinePreAuthDataProvider(), []);
  const { data: patients } = useSupabaseQuery("patients");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: doctors } = useSupabaseQuery("doctors");
  const { data: procedures } = useSupabaseQuery("procedures");
  const { data: settings } = useSupabaseQuery("system_settings");

  const [patientId, setPatientId] = useState("");
  const [insurerId, setInsurerId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [procedureDate, setProcedureDate] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [currency, setCurrency] = useState("GH¢");
  const [format, setFormat] = useState<"ghana" | "international">("ghana");
  const [items, setItems] = useState<PreAuthStudioItem[]>([blankItem()]);
  const [notes, setNotes] = useState("");
  const [savedId, setSavedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [warningsConfirmed, setWarningsConfirmed] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [preparedEmail, setPreparedEmail] = useState<PreAuthSubmissionPackage | null>(null);

  const selectedPatient = (patients || []).find((row: any) => row.id === patientId);
  const selectedInsurer = (insurers || []).find((row: any) => row.id === insurerId);
  const selectedDoctor = (doctors || []).find((row: any) => row.id === doctorId);
  const selectedProcedure = (procedures || []).find((row: any) => row.id === procedureId);
  const getSetting = (key: string) => settings?.find?.((row: any) => row.key === key)?.value || "";
  const providerName = getSetting("provider_name") || "MT. CARMEL HOSPITAL AND FERTILITY CENTER";
  const providerAddress = getSetting("provider_address") || "Loc: Community 25 Tema. P.O. Box 3618 Tema comm 1.";
  const providerPhone = getSetting("provider_phone") || "+233 242 160 557 / +233 303 939 896";
  const providerLogoUrl = getSetting("provider_logo_url");
  const patientName = selectedPatient?.patient_name || "Patient";
  const membershipNumber = selectedPatient?.membership_number || "";
  const procedureName = selectedProcedure?.procedure_name || "Procedure";
  const issuedDate = new Date().toLocaleDateString("en-GB");
  const total = useMemo(() => totalItems(items), [items]);

  const reviewInput = useMemo<PreAuthReviewInput>(() => ({
    patientId,
    patientName,
    membershipNumber,
    insurerId,
    insurerName: selectedInsurer?.company_name || "",
    procedureId,
    procedureName,
    procedureDate,
    diagnosis,
    doctorId,
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
  }), [patientId, patientName, membershipNumber, insurerId, selectedInsurer, procedureId, procedureName, procedureDate, diagnosis, doctorId, selectedDoctor, patientPhone, selectedPatient, companyName, providerName, providerAddress, providerPhone, providerLogoUrl, issuedDate, currency, format, items, settings]);

  const review = useMemo(() => validatePreAuthReview(reviewInput), [reviewInput]);
  const duplicateSignature = buildDuplicateSignature(reviewInput);
  const email = useMemo(() => buildPreAuthEmail({
    patientName,
    membershipNumber,
    procedureName,
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
  }), [patientName, membershipNumber, procedureName, procedureDate, diagnosis, selectedInsurer, providerName, settings]);

  const saveDraft = async () => {
    setSaving(true);
    try {
      const duplicate = await provider.findDuplicates(duplicateSignature, savedId || undefined);
      if (duplicate.length) throw new Error("A matching offline pre-authorization already exists.");
      const created = savedId
        ? await provider.updateDraft({ preauthId: savedId, reviewInput, doctorId, notes })
        : await provider.createDraft(reviewInput, user?.id || null);
      setSavedId(created.id);
      toast({ title: "Draft saved locally", description: `Request ${buildRequestNumber(created.id)} is ready for review.` });
      return created.id;
    } catch (error: any) {
      toast({ title: "Unable to save draft", description: error.message || "Please try again.", variant: "destructive" });
      return null;
    } finally { setSaving(false); }
  };

  const reviewRequest = async () => {
    const id = await saveDraft();
    if (!id) return;
    const duplicates = await provider.findDuplicates(duplicateSignature, id);
    setDuplicateMatches(duplicates);
    setWarningsConfirmed(false);
    setReviewOpen(true);
  };

  const finalizeRequest = async () => {
    const id = await saveDraft();
    if (!id) return;
    if (!review.ready) { setReviewOpen(true); toast({ title: "Resolve blocking errors", description: `${review.errors.length} blocking issue(s) remain.`, variant: "destructive" }); return; }
    if (review.warnings.length && !warningsConfirmed) { setReviewOpen(true); toast({ title: "Confirm review warnings", description: "Review and confirm the warnings before freezing this request.", variant: "destructive" }); return; }
    if (duplicateMatches.length) { toast({ title: "Possible duplicate request", description: "Review the existing matching request before creating another.", variant: "destructive" }); return; }
    if (!email.subject.trim() || !email.body.trim()) { toast({ title: "Email package incomplete", description: "The email subject and body must be available before freeze.", variant: "destructive" }); return; }

    setSubmitting(true);
    try {
      const finalRequestNumber = buildRequestNumber(id);
      const frozenSnapshot = buildPreAuthDocumentPayload(reviewInput, finalRequestNumber);
      assertPreAuthSnapshotMatchesReviewInput(frozenSnapshot, reviewInput);
      const recipients = buildPreAuthRecipientManifest({
        insurerEmail: selectedInsurer?.email,
        insurerName: selectedInsurer?.company_name,
        additionalEmails: selectedInsurer?.additional_emails,
        ccEmails: (getSetting("claims_cc_emails") || "").split(",").map((value: string) => value.trim()).filter(Boolean),
      });
      if (!recipients.some((recipient) => recipient.type === "to")) throw new Error("The insurer does not have a valid email address for the authorization request.");
      const finalized = await provider.finalizeDraft({ preauthId: id, reviewInput, doctorId, notes, recipientManifest: recipients, subject: email.subject, messageBody: email.body });
      if (!Number.isInteger(finalized.versionNumber) || finalized.versionNumber < 1) throw new Error("Offline freeze did not return a valid revision number.");
      const submissionPackage = buildPreAuthSubmissionPackageFromSnapshot({
        preauthId: id,
        versionNumber: finalized.versionNumber,
        requestNumber: finalized.requestNumber,
        snapshot: finalized.snapshot as any,
        subject: finalized.submission.subject as string,
        messageBody: finalized.submission.message_body as string,
        insurerEmail: selectedInsurer?.email,
        insurerName: selectedInsurer?.company_name,
        additionalEmails: selectedInsurer?.additional_emails,
        ccEmails: (getSetting("claims_cc_emails") || "").split(",").map((value: string) => value.trim()).filter(Boolean),
      });
      await downloadPreAuthPdfFromSnapshot(finalized.snapshot as any);
      setPreparedEmail(submissionPackage);
      setReviewOpen(false);
      toast({ title: "Pre-authorization frozen", description: `${finalized.requestNumber}-v${finalized.versionNumber} is ready for email handoff.` });
    } catch (error: any) {
      toast({ title: "Unable to freeze request", description: error.message || "Please try again.", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const openPreparedEmail = () => {
    if (!preparedEmail) return;
    const to = preparedEmail.recipients.find((recipient) => recipient.type === "to")?.email || "";
    const cc = preparedEmail.recipients.filter((recipient) => recipient.type === "cc").map((recipient) => recipient.email).join(",");
    window.open(`mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(preparedEmail.subject)}&body=${encodeURIComponent(preparedEmail.messageBody)}`, "_blank");
  };

  const updateItem = (id: string, patch: Partial<PreAuthStudioItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><h1 className="page-title">Offline Pre-Authorization Studio</h1><p className="page-description">Internal-first workspace. Data is stored locally in IndexedDB and can be backed up through Excel.</p></div>
        <Badge variant="secondary">OFFLINE MODE</Badge>
      </div>

      <OfflineDataControls />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="stat-card space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>Patient</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={patientId} onChange={(e) => setPatientId(e.target.value)}><option value="">Select patient…</option>{(patients || []).map((row: any) => <option key={row.id} value={row.id}>{row.patient_name} {row.membership_number ? `— ${row.membership_number}` : ""}</option>)}</select></div>
            <div><Label>Insurer</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={insurerId} onChange={(e) => setInsurerId(e.target.value)}><option value="">Select insurer…</option>{(insurers || []).map((row: any) => <option key={row.id} value={row.id}>{row.company_name}</option>)}</select></div>
            <div><Label>Doctor</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">Select doctor…</option>{(doctors || []).map((row: any) => <option key={row.id} value={row.id}>{row.doctor_name}</option>)}</select></div>
            <div><Label>Procedure</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={procedureId} onChange={(e) => { setProcedureId(e.target.value); const row = (procedures || []).find((item: any) => item.id === e.target.value); setItems([{ ...blankItem(), description: row?.procedure_name || "", unitPrice: Number(row?.default_tariff) || 0 }]); }}><option value="">Select procedure…</option>{(procedures || []).map((row: any) => <option key={row.id} value={row.id}>{row.procedure_name}</option>)}</select></div>
            <div><Label>Procedure date</Label><Input type="date" value={procedureDate} onChange={(e) => setProcedureDate(e.target.value)} /></div>
            <div><Label>Patient phone</Label><Input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="Optional" /></div>
            <div><Label>Employer / client company</Label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Optional" /></div>
            <div><Label>Diagnosis</Label><Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Diagnosis / code" /></div>
            <div><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value)} /></div>
            <div><Label>Document format</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={format} onChange={(e) => setFormat(e.target.value as "ghana" | "international")}><option value="ghana">Ghana facility</option><option value="international">International neutral</option></select></div>
          </div>

          <div className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">Charges</h2><Button variant="outline" size="sm" onClick={() => setItems((current) => [...current, blankItem()])}><Plus className="mr-1 h-4 w-4" />Add line</Button></div>
            {items.map((item) => <div key={item.id} className="grid gap-2 md:grid-cols-[1fr_110px_130px_90px_auto] items-end rounded-md border p-3"><div><Label>Description</Label><Input value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} /></div><div><Label>Qty</Label><Input type="number" min="0" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })} /></div><div><Label>Unit price</Label><Input type="number" min="0" value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) })} /></div><div><Label>Amount</Label><Input value={itemAmount(item).toFixed(2)} readOnly /></div><Button variant="ghost" size="icon" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}><Trash2 className="h-4 w-4" /></Button></div>)}
            <div className="flex justify-end text-lg font-semibold">Total: {currency} {total.toFixed(2)}</div>
          </div>

          <div><Label>Internal notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional internal notes" /></div>

          <div className="flex flex-wrap gap-2"><Button onClick={() => void saveDraft()} disabled={saving || submitting}><Save className="mr-1 h-4 w-4" />{saving ? "Saving…" : "Save draft"}</Button><Button variant="outline" onClick={() => void reviewRequest()} disabled={saving || submitting}><FileCheck2 className="mr-1 h-4 w-4" />Review request</Button></div>
        </section>

        <aside className="stat-card space-y-4"><div><p className="text-sm text-muted-foreground">Live summary</p><h2 className="text-lg font-semibold">{savedId ? buildRequestNumber(savedId) : "Draft not saved"}</h2></div><div className="space-y-2 text-sm"><p><strong>Patient:</strong> {patientName}</p><p><strong>Membership:</strong> {membershipNumber || "—"}</p><p><strong>Insurer:</strong> {selectedInsurer?.company_name || "—"}</p><p><strong>Procedure:</strong> {procedureName}</p><p><strong>Total:</strong> {currency} {total.toFixed(2)}</p></div>{review.errors.length ? <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{review.errors.map((error) => <div key={`${error.field}-${error.message}`}>{error.message}</div>)}</div> : <div className="rounded-md border p-3 text-sm">No blocking review errors detected.</div>}</aside>
      </div>

      {reviewOpen && <div className="stat-card space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Final review</h2><p className="text-sm text-muted-foreground">Freeze creates one immutable local revision and prepares the email handoff.</p></div><Badge>{review.ready ? "Ready" : "Needs correction"}</Badge></div>{review.errors.length > 0 && <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive space-y-1">{review.errors.map((error) => <p key={`${error.field}-${error.message}`}>{error.message}</p>)}</div>}{review.warnings.length > 0 && <div className="rounded-md border p-3 text-sm space-y-2"><p className="font-medium">Warnings</p>{review.warnings.map((warning) => <p key={`${warning.field}-${warning.message}`}>{warning.message}</p>)}<label className="flex items-center gap-2"><input type="checkbox" checked={warningsConfirmed} onChange={(e) => setWarningsConfirmed(e.target.checked)} /> I have reviewed and accept these warnings.</label></div>}{duplicateMatches.length > 0 && <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">Potential duplicates detected: {duplicateMatches.length}. Resolve before freeze.</div>}<div className="flex gap-2"><Button onClick={() => void finalizeRequest()} disabled={submitting || !review.ready || duplicateMatches.length > 0}><FileCheck2 className="mr-1 h-4 w-4" />{submitting ? "Freezing…" : "Freeze & prepare email"}</Button><Button variant="ghost" onClick={() => setReviewOpen(false)}>Close</Button></div></div>}

      {preparedEmail && <div className="stat-card space-y-3"><div className="flex items-center gap-2"><Mail className="h-4 w-4" /><h2 className="font-semibold">Email handoff ready</h2></div><p className="text-sm text-muted-foreground">The PDF was generated from the frozen revision. CareFlow prepares the email but does not claim that the insurer received it.</p><div className="flex flex-wrap gap-2"><Button onClick={openPreparedEmail}><Mail className="mr-1 h-4 w-4" />Open email client</Button><Button variant="outline" onClick={() => void downloadPreAuthPdfFromSnapshot(preparedEmail.snapshot as any)}><Download className="mr-1 h-4 w-4" />Download frozen PDF</Button></div></div>}
    </div>
  );
}
