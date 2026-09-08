import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  findDuplicatePreAuthorization,
  normalizePreAuthIdentity,
  type PreAuthClientIdentity,
  type PreAuthInsuranceIdentity,
} from "@/features/preauth/services/preauthIdentity.service";

interface ProcedureItem {
  id: string;
  description: string;
  quantity: number;
  unitCharge: number;
}

interface PreAuthTextFirstFormProps {
  onBack: () => void;
  editData?: any;
}

const emptyClient: PreAuthClientIdentity = {
  name: "",
  dateOfBirth: null,
  phone: null,
  email: null,
  address: null,
  identifier: null,
  membershipNumber: null,
  patientId: null,
};

const emptyInsurance: PreAuthInsuranceIdentity = {
  name: "",
  insurerId: null,
  memberNumber: null,
  planName: null,
  phone: null,
  email: null,
  policyReference: null,
};

const newItem = (): ProcedureItem => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unitCharge: 0,
});

export default function PreAuthTextFirstForm({ onBack, editData }: PreAuthTextFirstFormProps) {
  const { user } = useAuth();
  const { data: patients } = useSupabaseQuery("patients");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: doctors } = useSupabaseQuery("doctors");
  const { data: procedures } = useSupabaseQuery("procedures");
  const { data: diagnosisCodes } = useSupabaseQuery("diagnosis_codes");
  const { data: templates } = useSupabaseQuery("procedure_templates");
  const { data: settings } = useSupabaseQuery("system_settings");
  const { data: catalogItems } = useSupabaseQuery("preauth_catalog_items");
  const insertPreauth = useSupabaseInsert("pre_authorizations");
  const updatePreauth = useSupabaseUpdate("pre_authorizations");

  const isEditing = Boolean(editData);
  const [client, setClient] = useState<PreAuthClientIdentity>(emptyClient);
  const [insurance, setInsurance] = useState<PreAuthInsuranceIdentity>(emptyInsurance);
  const [patientSearch, setPatientSearch] = useState("");
  const [insurerSearch, setInsurerSearch] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [diagnosisCode, setDiagnosisCode] = useState("");
  const [procedureDate, setProcedureDate] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [accommodationDays, setAccommodationDays] = useState<number | "">("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [extraDiagnoses, setExtraDiagnoses] = useState<string[]>([]);
  const [customDiagnosisInput, setCustomDiagnosisInput] = useState("");
  const [items, setItems] = useState<ProcedureItem[]>([newItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState<any>(null);

  const companyInfo = useMemo(() => ({
    provider_name: settings?.find?.((s: any) => s.key === "provider_name")?.value || "",
    provider_address: settings?.find?.((s: any) => s.key === "provider_address")?.value || "",
    provider_phone: settings?.find?.((s: any) => s.key === "provider_phone")?.value || "",
  }), [settings]);

  useEffect(() => {
    if (!editData) return;
    setClient({
      patientId: editData.patient_id || null,
      name: editData.client_name || editData.patient_name || "",
      dateOfBirth: editData.client_date_of_birth || null,
      phone: editData.client_phone || null,
      email: editData.client_email || null,
      address: editData.client_address || null,
      identifier: editData.client_identifier || null,
      membershipNumber: editData.client_membership_number || editData.membership_number || null,
    });
    setInsurance({
      insurerId: editData.insurance_company_id || null,
      name: editData.insurer_name || "",
      memberNumber: editData.insurer_member_number || "",
      planName: editData.insurer_plan_name || "",
      phone: editData.insurer_phone || "",
      email: editData.insurer_email || "",
      policyReference: editData.insurer_policy_reference || "",
    });
    setDoctorId(editData.doctor_id || "");
    setProcedureId(editData.procedure_id || "");
    setProcedureDate(editData.procedure_date || "");
    setAccommodationDays(editData.accommodation_days ?? "");
    setClinicalNotes(editData.clinical_notes || "");
    setApprovalNotes(editData.approval_notes || "");
    setExtraDiagnoses(Array.isArray(editData.custom_diagnoses) ? editData.custom_diagnoses : []);
    setTemplateId(editData.template_id || "");

    void (async () => {
      const { data } = await (supabase.from("preauth_items") as any)
        .select("id, description, quantity, unit_price")
        .eq("preauth_id", editData.id)
        .order("id");
      if (data?.length) {
        setItems(data.map((item: any) => ({
          id: String(item.id),
          description: item.description || "",
          quantity: Number(item.quantity) || 1,
          unitCharge: Number(item.unit_price) || 0,
        })));
      }
    })();
  }, [editData]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return (patients || []).slice(0, 25);
    return (patients || []).filter((p: any) =>
      [p.patient_name, p.membership_number, p.phone].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    ).slice(0, 25);
  }, [patients, patientSearch]);

  const filteredInsurers = useMemo(() => {
    const q = insurerSearch.trim().toLowerCase();
    return (insurers || [])
      .filter((i: any) => i.is_active !== false)
      .filter((i: any) => !q || String(i.company_name || "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [insurers, insurerSearch]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitCharge) || 0), 0),
    [items],
  );

  const updateClient = (patch: Partial<PreAuthClientIdentity>) => setClient((current) => ({ ...current, ...patch }));
  const updateInsurance = (patch: Partial<PreAuthInsuranceIdentity>) => setInsurance((current) => ({ ...current, ...patch }));

  const loadSavedPatient = (id: string) => {
    const patient = (patients || []).find((p: any) => p.id === id);
    if (!patient) return;
    updateClient({
      patientId: patient.id,
      name: patient.patient_name || "",
      phone: patient.phone || null,
      membershipNumber: patient.membership_number || null,
    });
    setPatientSearch("");
    toast({ title: "Saved client loaded", description: "You can edit any field without changing the stored client record." });
  };

  const loadSavedInsurer = (id: string) => {
    const insurer = (insurers || []).find((i: any) => i.id === id);
    if (!insurer) return;
    updateInsurance({
      insurerId: insurer.id,
      name: insurer.company_name || "",
      phone: insurer.phone || null,
      email: insurer.email || null,
    });
    setInsurerSearch("");
  };

  const selectProcedure = (id: string) => {
    setProcedureId(id);
    const procedure = (procedures || []).find((p: any) => p.id === id);
    if (procedure) setItems([{ ...newItem(), description: procedure.procedure_name || "", unitCharge: Number(procedure.default_tariff) || 0 }]);
  };

  const selectTemplate = (id: string) => {
    setTemplateId(id);
    const template = (templates || []).find((t: any) => t.id === id);
    if (!template) return;
    try {
      const templateItems = typeof template.items === "string" ? JSON.parse(template.items) : template.items;
      if (Array.isArray(templateItems) && templateItems.length) {
        setItems(templateItems.map((item: any) => ({
          id: crypto.randomUUID(),
          description: item.description || "",
          quantity: Number(item.quantity || 1),
          unitCharge: Number(item.unitCharge ?? item.unit_price ?? 0),
        })));
      }
    } catch {
      toast({ title: "Template warning", description: "The template could not be read completely.", variant: "destructive" });
    }
    if (template.procedure_id) setProcedureId(template.procedure_id);
    if (template.diagnosis_code_id) setDiagnosisCode(template.diagnosis_code_id);
  };

  const updateItem = (id: string, patch: Partial<ProcedureItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const checkDuplicate = async () => {
    const diagnosisText = diagnosisCode
      ? `${(diagnosisCodes || []).find((d: any) => d.id === diagnosisCode)?.code || ""} - ${(diagnosisCodes || []).find((d: any) => d.id === diagnosisCode)?.description || ""}`
      : null;
    const result = await findDuplicatePreAuthorization({
      patientId: client.patientId,
      insurerId: insurance.insurerId,
      doctorId,
      procedureId,
      procedureDate,
      diagnosis: diagnosisText,
      excludeId: editData?.id || null,
      items: items.filter((item) => item.description.trim()).map((item) => ({
        description: item.description,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unitCharge) || 0,
        amount: (Number(item.quantity) || 0) * (Number(item.unitCharge) || 0),
      })),
    });
    setDuplicate(result);
    return result;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setDuplicate(null);
    try {
      if (!client.name.trim()) throw new Error("Client name is required.");
      if (!insurance.name.trim()) throw new Error("Insurer name is required. Select a saved insurer or type the insurer manually.");
      const validItems = items.filter((item) => item.description.trim());
      if (!validItems.length) throw new Error("Add at least one service or charge line.");
      if (validItems.some((item) => Number(item.quantity) <= 0 || Number(item.unitCharge) < 0)) throw new Error("Check quantities and charges before submitting.");

      const existing = await checkDuplicate();
      if (existing) {
        toast({
          title: "Possible duplicate request",
          description: `Request #${existing.request_number || existing.id} already matches this request. Review it before creating another document.`,
          variant: "destructive",
        });
        return;
      }

      const diagnosisText = diagnosisCode
        ? `${(diagnosisCodes || []).find((d: any) => d.id === diagnosisCode)?.code || ""} - ${(diagnosisCodes || []).find((d: any) => d.id === diagnosisCode)?.description || ""}`
        : null;
      const identity = normalizePreAuthIdentity(client, insurance);
      const payload = {
        ...identity,
        doctor_id: doctorId || null,
        procedure_id: procedureId || null,
        diagnosis: diagnosisText,
        procedure_date: procedureDate || null,
        total_cost: total,
        provider_name: companyInfo.provider_name || null,
        provider_address: companyInfo.provider_address || null,
        provider_phone: companyInfo.provider_phone || null,
        created_by: user?.id || null,
        status: isEditing ? editData.status : "pending",
        accommodation_days: accommodationDays === "" ? null : Number(accommodationDays),
        clinical_notes: clinicalNotes.trim() || null,
        approval_notes: approvalNotes.trim() || null,
        custom_diagnoses: extraDiagnoses,
        diagnosis_ids: diagnosisCode ? [diagnosisCode] : [],
        template_id: templateId || null,
      };

      let preauthId = editData?.id;
      if (isEditing) {
        await updatePreauth.mutateAsync({ id: editData.id, ...payload });
        await (supabase.from("preauth_items") as any).delete().eq("preauth_id", editData.id);
      } else {
        const created = await insertPreauth.mutateAsync(payload);
        preauthId = created.id;
      }

      await (supabase.from("preauth_items") as any).insert(validItems.map((item) => ({
        preauth_id: preauthId,
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unit_price: Number(item.unitCharge),
        amount: Number(item.quantity) * Number(item.unitCharge),
      })));

      toast({ title: isEditing ? "Pre-authorization updated" : "Pre-authorization created", description: `Total: GH¢ ${total.toLocaleString()}` });
      onBack();
    } catch (error: any) {
      const message = String(error?.message || "Unable to save the pre-authorization.");
      toast({ title: "Pre-authorization not saved", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl pb-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
        <div>
          <h1 className="page-title">{isEditing ? "Edit Pre-Authorization" : "Pre-Authorization Studio"}</h1>
          <p className="page-description">Create a request from stored information, typed information, or a combination of both.</p>
        </div>
      </div>

      <div className="stat-card border-l-4">
        <h3 className="font-heading font-semibold">Text-first workflow</h3>
        <p className="text-sm text-muted-foreground mt-1">A saved client record is optional. The information entered here becomes the point-in-time identity on this authorization request and does not update the client master record.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="stat-card space-y-4">
          <h2 className="font-heading font-semibold">Client / Patient</h2>
          <div>
            <Label>Optional saved client lookup</Label>
            <Input className="mt-1" placeholder="Search name, membership number or phone..." value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} />
            {patientSearch && filteredPatients.length > 0 && (
              <div className="mt-1 border rounded-md divide-y max-h-40 overflow-auto">
                {filteredPatients.map((p: any) => <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => loadSavedPatient(p.id)}>{p.patient_name} {p.membership_number ? `(${p.membership_number})` : ""}</button>)}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Full name *</Label><Input className="mt-1" value={client.name} onChange={(e) => updateClient({ name: e.target.value })} /></div>
            <div><Label>Date of birth</Label><Input className="mt-1" type="date" value={client.dateOfBirth || ""} onChange={(e) => updateClient({ dateOfBirth: e.target.value || null })} /></div>
            <div><Label>Phone</Label><Input className="mt-1" value={client.phone || ""} onChange={(e) => updateClient({ phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input className="mt-1" type="email" value={client.email || ""} onChange={(e) => updateClient({ email: e.target.value })} /></div>
            <div><Label>Membership / card number</Label><Input className="mt-1" value={client.membershipNumber || ""} onChange={(e) => updateClient({ membershipNumber: e.target.value })} /></div>
            <div><Label>Client identifier</Label><Input className="mt-1" value={client.identifier || ""} onChange={(e) => updateClient({ identifier: e.target.value })} placeholder="Hospital / national / local reference" /></div>
          </div>
          <div><Label>Address</Label><Input className="mt-1" value={client.address || ""} onChange={(e) => updateClient({ address: e.target.value })} /></div>
        </section>

        <section className="stat-card space-y-4">
          <h2 className="font-heading font-semibold">Insurance / Payer</h2>
          <div>
            <Label>Optional saved insurer lookup</Label>
            <Input className="mt-1" placeholder="Search saved insurers..." value={insurerSearch} onChange={(e) => setInsurerSearch(e.target.value)} />
            {insurerSearch && filteredInsurers.length > 0 && <div className="mt-1 border rounded-md divide-y max-h-40 overflow-auto">{filteredInsurers.map((i: any) => <button key={i.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => loadSavedInsurer(i.id)}>{i.company_name}</button>)}</div>}
          </div>
          <div><Label>Insurer name *</Label><Input className="mt-1" value={insurance.name} onChange={(e) => updateInsurance({ name: e.target.value, insurerId: null })} placeholder="Type insurer if not stored" /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Member number</Label><Input className="mt-1" value={insurance.memberNumber || ""} onChange={(e) => updateInsurance({ memberNumber: e.target.value })} /></div>
            <div><Label>Plan / product</Label><Input className="mt-1" value={insurance.planName || ""} onChange={(e) => updateInsurance({ planName: e.target.value })} /></div>
            <div><Label>Policy reference</Label><Input className="mt-1" value={insurance.policyReference || ""} onChange={(e) => updateInsurance({ policyReference: e.target.value })} /></div>
            <div><Label>Insurer phone</Label><Input className="mt-1" value={insurance.phone || ""} onChange={(e) => updateInsurance({ phone: e.target.value })} /></div>
            <div><Label>Insurer email</Label><Input className="mt-1" value={insurance.email || ""} onChange={(e) => updateInsurance({ email: e.target.value })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Changing the insurer here changes only this authorization request. It does not alter any saved client record.</p>
        </section>
      </div>

      <section className="stat-card space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="font-heading font-semibold">Clinical & Request Details</h2><select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={templateId} onChange={(e) => selectTemplate(e.target.value)}><option value="">Quick template...</option>{(templates || []).map((t: any) => <option key={t.id} value={t.id}>{t.template_name}</option>)}</select></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>Doctor</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">Select / type later</option>{(doctors || []).map((d: any) => <option key={d.id} value={d.id}>{d.doctor_name}</option>)}</select></div>
          <div><Label>Procedure</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={procedureId} onChange={(e) => selectProcedure(e.target.value)}><option value="">Select / type in charges</option>{(procedures || []).map((p: any) => <option key={p.id} value={p.id}>{p.procedure_name}</option>)}</select></div>
          <div><Label>Procedure date</Label><Input className="mt-1" type="date" value={procedureDate} onChange={(e) => setProcedureDate(e.target.value)} /></div>
        </div>
        <div><Label>Diagnosis</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={diagnosisCode} onChange={(e) => setDiagnosisCode(e.target.value)}><option value="">Select diagnosis or use notes</option>{(diagnosisCodes || []).map((d: any) => <option key={d.id} value={d.id}>{d.code} - {d.description}</option>)}</select></div>
        <div><Label>Additional diagnoses / notes</Label><div className="flex gap-2 mt-1"><Input value={customDiagnosisInput} onChange={(e) => setCustomDiagnosisInput(e.target.value)} placeholder="Type a diagnosis or clinical detail" /><Button type="button" variant="outline" onClick={() => { if (customDiagnosisInput.trim()) { setExtraDiagnoses([...extraDiagnoses, customDiagnosisInput.trim()]); setCustomDiagnosisInput(""); } }}>Add</Button></div><div className="flex flex-wrap gap-2 mt-2">{extraDiagnoses.map((d, i) => <span key={`${d}-${i}`} className="text-xs border rounded-full px-2 py-1">{d}<button type="button" className="ml-2" onClick={() => setExtraDiagnoses(extraDiagnoses.filter((_, index) => index !== i))}>×</button></span>)}</div></div>
      </section>

      <section className="stat-card space-y-4">
        <div className="flex items-center justify-between"><h2 className="font-heading font-semibold">Charges</h2><Button type="button" variant="outline" size="sm" onClick={() => setItems([newItem(), ...items])}><Plus className="w-4 h-4 mr-1" /> Add line</Button></div>
        <div className="space-y-2">
          {items.map((item) => <div key={item.id} className="grid grid-cols-[1fr_90px_130px_36px] gap-2 items-center"><Input placeholder="Service / charge description" value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} /><Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })} /><Input type="number" min="0" step="0.01" value={item.unitCharge} onChange={(e) => updateItem(item.id, { unitCharge: Number(e.target.value) })} /><Button type="button" variant="ghost" size="icon" disabled={items.length === 1} onClick={() => setItems(items.filter((current) => current.id !== item.id))}><Trash2 className="w-4 h-4" /></Button></div>)}
          {(catalogItems || []).length > 0 && <p className="text-xs text-muted-foreground">Catalog items remain available elsewhere in the workflow; manual descriptions and charges are always allowed.</p>}
        </div>
        <div className="flex justify-end text-lg font-semibold">Total: GH¢ {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
      </section>

      <section className="stat-card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><Label>Accommodation days</Label><Input className="mt-1" type="number" min="0" value={accommodationDays} onChange={(e) => setAccommodationDays(e.target.value === "" ? "" : Number(e.target.value))} /></div><div><Label>Clinical notes</Label><Input className="mt-1" value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} /></div></div>
        <div><Label>Approval / payer notes</Label><Input className="mt-1" value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} /></div>
        {duplicate && <div className="rounded-md border p-3 text-sm"><strong>Existing request found:</strong> #{duplicate.request_number || duplicate.id} — {duplicate.status || duplicate.current_state || "existing"}. Do not create a second request unless the clinical or payer circumstances are materially different.</div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onBack}>Cancel</Button><Button type="button" disabled={submitting} onClick={handleSubmit}>{submitting ? "Saving..." : isEditing ? "Update request" : "Create authorization request"}</Button></div>
      </section>
    </div>
  );
}
