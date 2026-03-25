import { useState, useMemo, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import EntityDialog from "@/components/shared/EntityDialog";

interface ProcedureItem {
  id: number;
  description: string;
  quantity: number;
  unitCharge: number;
}

interface PreAuthFormProps {
  onBack: () => void;
  editData?: any;
}

function CatalogSearch({ value, onChange, onSelect, catalogItems }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (item: any) => void;
  catalogItems: any[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = catalogItems.filter((c: any) =>
    c.item_name?.toLowerCase().includes(value.toLowerCase())
  ).slice(0, 8);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Type to search catalog items..."
        className="h-8"
      />
      {open && value && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((item: any) => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex justify-between"
              onClick={() => { onSelect(item); setOpen(false); }}
            >
              <span>{item.item_name}</span>
              <span className="text-muted-foreground">GH¢ {Number(item.unit_price).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PreAuthForm({ onBack, editData }: PreAuthFormProps) {
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
  const insertPatient = useSupabaseInsert("patients");

  const isEditing = !!editData;

  const companyInfo = {
    provider_name: settings?.find?.((s: any) => s.key === "provider_name")?.value || "",
    provider_address: settings?.find?.((s: any) => s.key === "provider_address")?.value || "",
    provider_phone: settings?.find?.((s: any) => s.key === "provider_phone")?.value || "",
  };

  const [items, setItems] = useState<ProcedureItem[]>([
    { id: 1, description: "", quantity: 1, unitCharge: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [newPatient, setNewPatient] = useState({ patient_name: "", phone: "", membership_number: "" });
  const [newPatientDialogOpen, setNewPatientDialogOpen] = useState(false);
  const [insuranceId, setInsuranceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [diagnosisCode, setDiagnosisCode] = useState("");
  const [procedureDate, setProcedureDate] = useState("");
  const [templateId, setTemplateId] = useState("");

  const activeInsurers = (insurers || []).filter((i: any) => i.is_active !== false);

  useEffect(() => {
    if (editData) {
      setPatientId(editData.patient_id || "");
      setInsuranceId(editData.insurance_company_id || "");
      setDoctorId(editData.doctor_id || "");
      setProcedureId(editData.procedure_id || "");
      setProcedureDate(editData.procedure_date || "");
      setDiagnosisCode("");
      (async () => {
        const { data } = await (supabase.from("preauth_items") as any).select("*").eq("preauth_id", editData.id);
        if (data && data.length > 0) {
          setItems(data.map((item: any) => ({
            id: Date.now() + Math.random(),
            description: item.description,
            quantity: item.quantity,
            unitCharge: Number(item.unit_price),
          })));
        }
      })();
    }
  }, [editData]);

  const filteredPatients = useMemo(() => {
    if (!patientSearch) return patients || [];
    return (patients || []).filter((p: any) =>
      p.patient_name?.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.membership_number?.toLowerCase().includes(patientSearch.toLowerCase())
    );
  }, [patients, patientSearch]);

  const handleProcedureSelect = (procId: string) => {
    setProcedureId(procId);
    const proc = (procedures || []).find((p: any) => p.id === procId);
    if (proc && items.length === 1 && !items[0].description) {
      setItems([{ id: 1, description: proc.procedure_name, quantity: 1, unitCharge: Number(proc.default_tariff) || 0 }]);
    }
  };

  const handleTemplateSelect = (tplId: string) => {
    setTemplateId(tplId);
    const tpl = (templates || []).find((t: any) => t.id === tplId);
    if (tpl) {
      try {
        const tplItems = typeof tpl.items === "string" ? JSON.parse(tpl.items) : tpl.items;
        if (Array.isArray(tplItems) && tplItems.length > 0) {
          setItems(tplItems.map((item: any, i: number) => ({
            id: Date.now() + i,
            description: item.description || "",
            quantity: item.quantity || 1,
            unitCharge: item.unitCharge || item.unit_price || 0,
          })));
        }
      } catch { /* ignore */ }
      if (tpl.procedure_id) setProcedureId(tpl.procedure_id);
      if (tpl.diagnosis_code_id) setDiagnosisCode(tpl.diagnosis_code_id);
    }
  };

  const handlePatientSelect = (pId: string) => {
    setPatientId(pId);
    const patient = (patients || []).find((p: any) => p.id === pId);
    if (patient?.insurance_company_id) setInsuranceId(patient.insurance_company_id);
  };

  const handleSaveNewPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await insertPatient.mutateAsync({
        patient_name: newPatient.patient_name,
        phone: newPatient.phone || null,
        membership_number: newPatient.membership_number || null,
        insurance_company_id: insuranceId || null,
      });
      setPatientId(result.id);
      setNewPatientDialogOpen(false);
      setNewPatient({ patient_name: "", phone: "", membership_number: "" });
      toast({ title: "Patient registered successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // New items added on TOP
  const addItem = () => setItems([{ id: Date.now(), description: "", quantity: 1, unitCharge: 0 }, ...items]);
  const removeItem = (id: number) => { if (items.length > 1) setItems(items.filter((i) => i.id !== id)); };
  const updateItem = (id: number, field: keyof ProcedureItem, value: string | number) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const handleCatalogSelect = (id: number, catalogItem: any) => {
    updateItem(id, "description", catalogItem.item_name);
    updateItem(id, "unitCharge", Number(catalogItem.unit_price));
  };

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitCharge, 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (!patientId) {
        toast({ title: "Error", description: "Please select or create a patient", variant: "destructive" });
        setSubmitting(false);
        return;
      }

      const diagnosisText = diagnosisCode
        ? (diagnosisCodes || []).find((d: any) => d.id === diagnosisCode)?.code + " - " + (diagnosisCodes || []).find((d: any) => d.id === diagnosisCode)?.description
        : null;

      const payload = {
        patient_id: patientId,
        doctor_id: doctorId || null,
        procedure_id: procedureId || null,
        diagnosis: diagnosisText,
        procedure_date: procedureDate || null,
        insurance_company_id: insuranceId || null,
        total_cost: total,
        provider_name: companyInfo.provider_name || null,
        provider_address: companyInfo.provider_address || null,
        provider_phone: companyInfo.provider_phone || null,
        created_by: user?.id || null,
        status: isEditing ? editData.status : "pending",
      };

      let preauthId: string;
      if (isEditing) {
        await updatePreauth.mutateAsync({ id: editData.id, ...payload });
        preauthId = editData.id;
        await (supabase.from("preauth_items") as any).delete().eq("preauth_id", preauthId);
      } else {
        const preauth = await insertPreauth.mutateAsync(payload);
        preauthId = preauth.id;
      }

      const itemsToInsert = items.filter(i => i.description).map(i => ({
        preauth_id: preauthId,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unitCharge,
        amount: i.quantity * i.unitCharge,
      }));
      if (itemsToInsert.length > 0) {
        await (supabase.from("preauth_items") as any).insert(itemsToInsert);
      }

      toast({ title: isEditing ? "Pre-authorization updated!" : "Pre-authorization submitted!", description: `Total: GH¢ ${total.toLocaleString()}` });
      onBack();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="page-title">{isEditing ? "Edit Pre-Authorization" : "New Pre-Authorization Request"}</h1>
          <p className="page-description">{isEditing ? "Modify the submitted request" : "Create a new insurance approval request"}</p>
        </div>
      </div>

      {(templates || []).length > 0 && (
        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-2">Quick Start — Load Template</h3>
          <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={templateId} onChange={(e) => handleTemplateSelect(e.target.value)}>
            <option value="">Select a template to auto-fill...</option>
            {(templates || []).map((t: any) => <option key={t.id} value={t.id}>{t.template_name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card space-y-4">
          <h3 className="font-heading font-semibold">Patient Information</h3>
          <div className="space-y-3">
            <div>
              <Label>Search Patient</Label>
              <Input placeholder="Type patient name or membership no..." className="mt-1" value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} />
            </div>
            <div>
              <Label>Select Patient</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={patientId} onChange={(e) => handlePatientSelect(e.target.value)}>
                <option value="">Select patient...</option>
                {filteredPatients.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.patient_name} {p.membership_number ? `(${p.membership_number})` : ""}</option>
                ))}
              </select>
            </div>
            <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => setNewPatientDialogOpen(true)}>+ Add new patient</Button>
            <div>
              <Label>Insurance Company</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={insuranceId} onChange={(e) => setInsuranceId(e.target.value)}>
                <option value="">Select insurer...</option>
                {activeInsurers.map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold">Medical Information</h3>
            <div className="space-y-3">
              <div>
                <Label>Doctor</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  <option value="">Select doctor...</option>
                  {(doctors || []).map((d: any) => <option key={d.id} value={d.id}>{d.doctor_name} — {d.specialty || "General"}</option>)}
                </select>
              </div>
              <div>
                <Label>Procedure</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={procedureId} onChange={(e) => handleProcedureSelect(e.target.value)}>
                  <option value="">Select procedure...</option>
                  {(procedures || []).map((p: any) => <option key={p.id} value={p.id}>{p.procedure_code ? `[${p.procedure_code}] ` : ""}{p.procedure_name} — GH¢ {Number(p.default_tariff).toLocaleString()}</option>)}
                </select>
              </div>
              <div>
                <Label>Diagnosis (ICD-10)</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={diagnosisCode} onChange={(e) => setDiagnosisCode(e.target.value)}>
                  <option value="">Select diagnosis...</option>
                  {(diagnosisCodes || []).map((d: any) => <option key={d.id} value={d.id}>{d.code} — {d.description}</option>)}
                </select>
              </div>
              <div><Label>Procedure Date</Label><Input type="date" value={procedureDate} onChange={(e) => setProcedureDate(e.target.value)} className="mt-1" /></div>
            </div>
          </div>

          {companyInfo.provider_name && (
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-2">Provider (from Settings)</h3>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>{companyInfo.provider_name}</p>
                {companyInfo.provider_address && <p>{companyInfo.provider_address}</p>}
                {companyInfo.provider_phone && <p>Tel: {companyInfo.provider_phone}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="stat-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold">Procedure Cost Breakdown</h3>
          <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5">
            <Plus className="w-4 h-4" />Add Item
          </Button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th className="w-[40%]">Description</th>
              <th>Quantity</th>
              <th>Unit Charge (GH¢)</th>
              <th>Amount (GH¢)</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <CatalogSearch
                    value={item.description}
                    onChange={(v) => updateItem(item.id, "description", v)}
                    onSelect={(catItem) => handleCatalogSelect(item.id, catItem)}
                    catalogItems={catalogItems || []}
                  />
                </td>
                <td><Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 0)} className="h-8 w-20" /></td>
                <td><Input type="number" min={0} step={0.01} value={item.unitCharge} onChange={(e) => updateItem(item.id, "unitCharge", parseFloat(e.target.value) || 0)} className="h-8 w-28" /></td>
                <td className="font-semibold">{(item.quantity * item.unitCharge).toFixed(2)}</td>
                <td><button onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right font-heading font-bold text-base">Total</td>
              <td className="font-heading font-bold text-base text-primary">GH¢ {total.toFixed(2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onBack}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : isEditing ? "Update Request" : "Submit Request"}
          </Button>
        </div>
      </div>

      <EntityDialog open={newPatientDialogOpen} onOpenChange={setNewPatientDialogOpen} title="Register New Patient">
        <form onSubmit={handleSaveNewPatient} className="space-y-4">
          <div><Label>Patient Name *</Label><Input value={newPatient.patient_name} onChange={(e) => setNewPatient({ ...newPatient, patient_name: e.target.value })} required className="mt-1" /></div>
          <div><Label>Phone</Label><Input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} className="mt-1" /></div>
          <div><Label>Membership Number</Label><Input value={newPatient.membership_number} onChange={(e) => setNewPatient({ ...newPatient, membership_number: e.target.value })} className="mt-1" /></div>
          <Button type="submit" className="w-full" disabled={insertPatient.isPending}>
            {insertPatient.isPending ? "Saving..." : "Save Patient"}
          </Button>
        </form>
      </EntityDialog>
    </div>
  );
}
