import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [items, setItems] = useState<ProcedureItem[]>([
    { id: 1, description: "", quantity: 1, unitCharge: 0 },
  ]);

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

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="page-title">New Pre-Authorization Request</h1>
          <p className="page-description">Create a new insurance approval request</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="stat-card space-y-4">
          <h3 className="font-heading font-semibold">Patient Information</h3>
          <div className="space-y-3">
            <div><Label>Patient Name</Label><Input placeholder="Enter patient name" className="mt-1" /></div>
            <div><Label>Phone</Label><Input placeholder="Enter phone number" className="mt-1" /></div>
            <div><Label>Membership Number</Label><Input placeholder="Enter membership number" className="mt-1" /></div>
            <div><Label>Company Name</Label><Input placeholder="Enter company name" className="mt-1" /></div>
            <div><Label>Insurance Company</Label><Input placeholder="Select insurance company" className="mt-1" /></div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold">Medical Information</h3>
            <div className="space-y-3">
              <div><Label>Doctor Name</Label><Input placeholder="Enter doctor name" className="mt-1" /></div>
              <div><Label>Procedure</Label><Input placeholder="Select procedure" className="mt-1" /></div>
              <div><Label>Diagnosis</Label><Input placeholder="Enter diagnosis" className="mt-1" /></div>
              <div><Label>Procedure Date</Label><Input type="date" className="mt-1" /></div>
            </div>
          </div>

          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold">Hospital Information</h3>
            <div className="space-y-3">
              <div><Label>Provider Name</Label><Input placeholder="Enter provider name" className="mt-1" /></div>
              <div><Label>Address</Label><Input placeholder="Enter address" className="mt-1" /></div>
              <div><Label>Contact Phone</Label><Input placeholder="Enter contact phone" className="mt-1" /></div>
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
          <Button>Submit Request</Button>
        </div>
      </div>
    </div>
  );
}
