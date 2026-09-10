import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, FileCheck2, Mail, Plus, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { createPreAuthorizationAtomic } from "@/features/preauth/services/preauthStudio.service";
import { getStoredFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { buildPreAuthEmail, buildRequestNumber, buildDuplicateSignature, itemAmount, totalItems, type PreAuthStudioItem } from "@/modules/authorization/preauth-studio";
import { downloadPreAuthPdf, downloadPreAuthPdfFromSnapshot, type PreAuthPdfData } from "@/modules/authorization/preauth-document";
import { assertPreAuthSnapshotMatchesReviewInput } from "@/modules/authorization/preauth-integrity";
import { buildPreAuthDocumentPayload, validatePreAuthReview, type PreAuthReviewInput } from "@/modules/authorization/preauth-review";
import { buildPreAuthRecipientManifest, buildPreAuthSubmissionPackageFromSnapshot, type PreAuthSubmissionPackage } from "@/modules/authorization/preauth-submission";

const blankItem = (): PreAuthStudioItem => ({ id: crypto.randomUUID(), category: "procedure", description: "", quantity: 1, unitPrice: 0 });

export default function PreAuthorizationStudio() {
  const { user } = useAuth();
  const { data: patients } = useSupabaseQuery("patients");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: doctors } = useSupabaseQuery("doctors");
  const { data: procedures } = useSupabaseQuery("procedures");
  const { data: diagnoses } = useSupabaseQuery("diagnosis_codes");
  const { data: catalog } = useSupabaseQuery("preauth_catalog_items");
  const { data: tariffs } = useSupabaseQuery("preauth_insurer_tariffs" as any);
  const { data: settings } = useSupabaseQuery("system_settings");

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

  const pdfData = (finalRequestNumber = requestNumber): PreAuthPdfData => ({ requestNumber: savedId ? finalRequestNumber : undefined, issuedDate, patientName: effectivePatientName, membershipNumber, patientPhone: patientPhone || selectedPatient?.phone || "", companyName: companyName || selectedInsurer?.company_name || "", providerName, providerAddress, providerPhone, doctorName: selectedDoctor?.doctor_name || "", procedureName: effectiveProcedure, procedureDate, diagnosis, currency, format, logoUrl: providerLogoUrl || undefined });

  const email = useMemo(() => buildPreAuthEmail({ patientName: effectivePatientName, membershipNumber, procedureName: effectiveProcedure, procedureDate, diagnosis, insurerName: selectedInsurer?.company_name || "Insurance Partner", insurerContactPerson: selectedInsurer?.contact_person, providerName, providerEmail: getSetting("provider_email"), officerName: getSetting("officer_name"), officerPosition: getSetting("officer_position"), officerPhone: getSetting("officer_phone"), senderEmail: getSetting("claims_sender_email") }), [effectivePatientName, membershipNumber, effectiveProcedure, procedureDate, diagnosis, selectedInsurer, providerName, settings]);

  const reviewInput = useMemo<PreAuthReviewInput>(() => ({ patientId, patientName: effectivePatientName, membershipNumber, insurerId, insurerName: selectedInsurer?.company_name || "", procedureId, procedureName: effectiveProcedure, procedureDate, diagnosis, doctorName: selectedDoctor?.doctor_name || "", patientPhone: patientPhone || selectedPatient?.phone || "", companyName: companyName || selectedInsurer?.company_name || "", insurerEmail: selectedInsurer?.email || "", providerEmail: getSetting("provider_email"), providerName, providerAddress, providerPhone, providerLogoUrl: providerLogoUrl || undefined, issuedDate, currency, format, items }), [patientId, effectivePatientName, membershipNumber, insurerId, selectedInsurer, procedureId, effectiveProcedure, procedureDate, diagnosis, selectedDoctor, patientPhone, selectedPatient, companyName, providerName, providerAddress, providerPhone, providerLogoUrl, issuedDate, currency, format, items, settings]);
  const review = useMemo(() => validatePreAuthReview(reviewInput), [reviewInput]);
  const duplicateSignature = buildDuplicateSignature({ patientId, membershipNumber, procedureId, procedureDate, insurerId });

  const saveDraft = async (): Promise<string | null> => {
    if (!patientId || !insurerId || !procedureDate || !procedureId) {
      toast({ title: "Required information missing", description: "Patient, procedure, insurer, and procedure date are required.", variant: "destructive" });
      return null;
    }
    setSaving(true);
    try {
      const rows = items.filter((item) => item.description.trim()).map((item) => ({ description: item.description.trim(), quantity: Math.max(0, Number(item.quantity) || 0), unit_price: Math.max(0, Number(item.unitPrice) || 0), amount: itemAmount(item) }));
      if (!rows.length) throw new Error("PREAUTH_ITEMS_REQUIRED");
      const created = await createPreAuthorizationAtomic({ patient_id: patientId, insurance_company_id: insurerId, doctor_id: doctorId || null, procedure_id: procedureId, procedure_date: procedureDate, diagnosis: diagnosis || null, total_cost: total, provider_name: providerName, provider_address: providerAddress, provider_phone: providerPhone, status: "draft", current_state: "Draft", created_by: user?.id || null, client_company_name: companyName || selectedInsurer?.company_name || null, patient_phone: patientPhone || selectedPatient?.phone || null, clinical_notes: notes || null, document_format: format, document_currency: currency, duplicate_signature: duplicateSignature }, rows, true);
      const id = String(created?.id || created?.preauth_id || created?.[0]?.id || "");
      if (!id) throw new Error("The server did not return the new pre-authorization ID.");
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
    const facilityId = getStoredFacilityId();
    if (!facilityId) {
      toast({ title: "Facility context required", description: "Select a facility before reviewing duplicate requests.", variant: "destructive" });
      return;
    }
    const { data, error } = await (supabase.from("pre_authorizations") as any).select("id,request_number,status,current_state,procedure_date,duplicate_signature").eq("facility_id", facilityId).eq("duplicate_signature", duplicateSignature).neq("id", id).in("status", ["draft", "prepared"]).order("created_at", { ascending: false }).limit(5);
    if (error) { toast({ title: "Duplicate check unavailable", description: error.message, variant: "destructive" }); return; }
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
    if (!review.ready) { setReviewOpen(true); toast({ title: "Resolve blocking errors", description: `${review.errors.length} blocking issue(s) must be corrected before preparation.`, variant: "destructive" }); return; }
    if (review.warnings.length && !warningsConfirmed) { setReviewOpen(true); toast({ title: "Confirm review warnings", description: "Review the warnings and explicitly confirm them before preparation.", variant: "destructive" }); return; }
    if (duplicateMatches.length) { toast({ title: "Possible duplicate request", description: "Review the existing matching requests before creating another request.", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const finalRequestNumber = buildRequestNumber(id);
      const frozenSnapshot = buildPreAuthDocumentPayload(reviewInput, finalRequestNumber);
      assertPreAuthSnapshotMatchesReviewInput(frozenSnapshot, reviewInput);
      const recipients = buildPreAuthRecipientManifest({ insurerEmail: selectedInsurer?.email, insurerName: selectedInsurer?.company_name, additionalEmails: selectedInsurer?.additional_emails, ccEmails: (getSetting("claims_cc_emails") || "").split(",").map((value: string) => value.trim()).filter(Boolean) });
      if (!recipients.some((recipient) => recipient.type === "to")) throw new Error("The insurer does not have a valid email address for the authorization request.");
      const { data: finalized, error: finalizeError } = await (supabase.rpc as any)("finalize_preauthorization_handoff", { p_preauth_id: id, p_snapshot: frozenSnapshot, p_total_cost: review.total, p_recipient_manifest: recipients, p_attachment_manifest: [], p_subject: email.subject, p_message_body: email.body, p_idempotency_key: `${id}:freeze:${finalRequestNumber}` });
      if (finalizeError) throw finalizeError;
      const versionNumber = Number(finalized?.version_number);
      if (!Number.isInteger(versionNumber) || versionNumber < 1) throw new Error("The server did not return a valid frozen revision number.");
      const submissionPackage = buildPreAuthSubmissionPackageFromSnapshot({ preauthId: id, versionNumber, requestNumber: finalRequestNumber, snapshot: frozenSnapshot, subject: email.subject, messageBody: email.body, insurerEmail: selectedInsurer?.email, insurerName: selectedInsurer?.company_name, additionalEmails: selectedInsurer?.additional_emails, ccEmails: (getSetting("claims_cc_emails") || "").split(",").map((value: string) => value.trim()).filter(Boolean) });
      await downloadPreAuthPdfFromSnapshot(frozenSnapshot);
      const { error: auditError } = await ((supabase as any).from("preauthorization_audit_events")).insert({ preauth_id: id, version_id: finalized.version_id, submission_id: finalized.submission_id, event_type: "email_handoff_prepared", event_data: { versionNumber, recipientCount: submissionPackage.recipients.length, attachmentCount: submissionPackage.attachments.length }, actor_id: user?.id || null });
      if (auditError) console.warn("Pre-authorization audit event could not be recorded", auditError);
      setSavedId(id); setReviewOpen(false); openPreparedEmail(submissionPackage);
      toast({ title: "Authorization request prepared", description: `${finalRequestNumber} revision ${versionNumber} is frozen and recorded. The PDF and email are ready for your final review and send.` });
    } catch (error: any) { toast({ title: "Request preparation failed", description: error.message || "The request could not be frozen and prepared.", variant: "destructive" }); }
    finally { setSubmitting(false); }
  };
