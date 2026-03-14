import { useState, useMemo } from "react";
import { ArrowLeft, Plus, Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseQuery, useSupabaseInsert } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface ProcedureItem {
  id: number;
  description: string;
  quantity: number;
  unitCharge: number;
}

interface PreAuthFormProps {
  onBack: () => void;
}

export default function PreAuthForm({ onBack }: PreAuthFormProps) {
  const { user } = useAuth();
  const { data: patients } = useSupabaseQuery("patients");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: doctors } = useSupabaseQuery("doctors");
  const { data: procedures } = useSupabaseQuery("procedures");
  const { data: diagnosisCodes } = useSupabaseQuery("diagnosis_codes");
  const { data: templates } = useSupabaseQuery("procedure_templates");
  const insertPreauth = useSupabaseInsert("pre_authorizations");
  const insertPatient = useSupabaseInsert("patients");

  const [items, setItems] = useState<ProcedureItem[]>([
    { id: 1, description: "", quantity: 1, unitCharge: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [newPatient, setNewPatient] = useState({ patient_name: "", phone: "", membership_number: "" });
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [insuranceId, setInsuranceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [diagnosisCode, setDiagnosisCode] = useState("");
  const [procedureDate, setProcedureDate] = useState("");
  const [providerName, setProviderName] = useState("");
  const [providerAddress, setProviderAddress] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [templateId, setTemplateId] = useState("");

  // Filter patients by search
  const filteredPatients = useMemo(() => {
    if (!patientSearch) return patients || [];
    return (patients || []).filter((p: any) =>
      p.patient_name?.toLowerCase().includes(patientSearch.toLowerCase()) ||
      p.membership_number?.toLowerCase().includes(patientSearch.toLowerCase())
    );
  }, [patients, patientSearch]);

  // Auto-load tariff when procedure is selected
  const handleProcedureSelect = (procId: string) => {
    setProcedureId(procId);
    const proc = (procedures || []).find((p: any) => p.id === procId);
    if (proc && items.length === 1 && !items[0].description) {
      setItems([{ id: 1, description: proc.procedure_name, quantity: 1, unitCharge: Number(proc.default_tariff) || 0 }]);
    }
  };

  // Load template
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

  // Auto-set insurance when patient is selected
  const handlePatientSelect = (pId: string) => {
    setPatientId(pId);
    const patient = (patients || []).find((p: any) => p.id === pId);
    if (patient?.insurance_company_id) setInsuranceId(patient.insurance_company_id);
  };

  const addItem = () => {
    setItems([...items, { id: Date.now(), description: "", quantity: 1, unitCharge: 0 }]);
  };

  const removeItem = (id: number) => {
    if (items.length > 1) setItems(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: number, field: keyof ProcedureItem, value: string | number) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitCharge, 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let finalPatientId = patientId;

      // Create new patient if needed
      if (showNewPatient && newPatient.patient_name) {
        const patientData = await insertPatient.mutateAsync({
          patient_name: newPatient.patient_name,
          phone: newPatient.phone || null,
          membership_number: newPatient.membership_number || null,
          insurance_company_id: insuranceId || null,
        });
        finalPatientId = patientData.id;
      }

      if (!finalPatientId && !showNewPatient) {
        toast({ title: "Error", description: "Please select or create a patient", variant: "destructive" });
        setSubmitting(false);
        return;
      }

      // Create pre-authorization
      const preauth = await insertPreauth.mutateAsync({
        patient_id: finalPatientId,
        doctor_id: doctorId || null,
        procedure_id: procedureId || null,
        diagnosis: diagnosisCode ? (diagnosisCodes || []).find((d: any) => d.id === diagnosisCode)?.code + " - " + (diagnosisCodes || []).find((d: any) => d.id === diagnosisCode)?.description : null,
        procedure_date: procedureDate || null,
        insurance_company_id: insuranceId || null,
        total_cost: total,
        provider_name: providerName || null,
        provider_address: providerAddress || null,
        provider_phone: providerPhone || null,
        created_by: user?.id || null,
        status: "pending",
      });

      // Insert preauth items
      if (preauth?.id) {
        const itemsToInsert = items.filter(i => i.description).map(i => ({
          preauth_id: preauth.id,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unitCharge,
          amount: i.quantity * i.unitCharge,
        }));
        if (itemsToInsert.length > 0) {
          await (supabase.from("preauth_items") as any).insert(itemsToInsert);
        }
      }

      toast({ title: "Pre-authorization submitted!", description: `Total: GH¢ ${total.toLocaleString()}` });
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
          <h1 className="page-title">New Pre-Authorization Request</h1>
          <p className="page-description">Create a new insurance approval request</p>
        </div>
      </div>

      {/* Template selector */}
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
            {!showNewPatient ? (
              <>
                <div>
                  <Label>Search Patient</Label>
                  <Input placeholder="Type patient name or membership no..." className="mt-1" value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} />
                </div>
                <div>
                  <Label>Select Patient</Label>
                  <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={patientId} onChange={(e) => handlePatientSelect(e.target.value)}>
                    <option value="">Select patient...</option>
                    {filteredPatients.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.patient_name} {p.membership_number ? `(${p.membership_number})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => setShowNewPatient(true)}>+ Add new patient</Button>
              </>
            ) : (
              <>
                <div><Label>Patient Name *</Label><Input value={newPatient.patient_name} onChange={(e) => setNewPatient({ ...newPatient, patient_name: e.target.value })} className="mt-1" /></div>
                <div><Label>Phone</Label><Input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} className="mt-1" /></div>
                <div><Label>Membership Number</Label><Input value={newPatient.membership_number} onChange={(e) => setNewPatient({ ...newPatient, membership_number: e.target.value })} className="mt-1" /></div>
                <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => setShowNewPatient(false)}>← Select existing patient</Button>
              </>
            )}
            <div>
              <Label>Insurance Company</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={insuranceId} onChange={(e) => setInsuranceId(e.target.value)}>
                <option value="">Select insurer...</option>
                {(insurers || []).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}
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

          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold">Hospital Information</h3>
            <div className="space-y-3">
              <div><Label>Provider Name</Label><Input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="Enter provider name" className="mt-1" /></div>
              <div><Label>Address</Label><Input value={providerAddress} onChange={(e) => setProviderAddress(e.target.value)} placeholder="Enter address" className="mt-1" /></div>
              <div><Label>Contact Phone</Label><Input value={providerPhone} onChange={(e) => setProviderPhone(e.target.value)} placeholder="Enter contact phone" className="mt-1" /></div>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold">Procedure Cost Breakdown</h3>
          <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Item
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
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, "description", e.target.value)}
                    placeholder="Procedure description"
                    className="h-8"
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                    className="h-8 w-20"
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unitCharge}
                    onChange={(e) => updateItem(item.id, "unitCharge", parseFloat(e.target.value) || 0)}
                    className="h-8 w-28"
                  />
                </td>
                <td className="font-semibold">
                  {(item.quantity * item.unitCharge).toFixed(2)}
                </td>
                <td>
                  <button onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right font-heading font-bold text-base">Total</td>
              <td className="font-heading font-bold text-base text-primary">
                GH¢ {total.toFixed(2)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onBack}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
