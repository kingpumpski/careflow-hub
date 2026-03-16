import { useState, useEffect } from "react";
import { Upload, Percent, DollarSign, Mail, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { data: settings, refetch } = useSupabaseQuery("system_settings");

  const getSetting = (key: string) => settings?.find?.((s: any) => s.key === key)?.value || "";

  const [providerName, setProviderName] = useState("");
  const [providerAddress, setProviderAddress] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [providerEmail, setProviderEmail] = useState("");
  const [taxRate, setTaxRate] = useState("5");
  const [currency, setCurrency] = useState("GH¢ (Ghana Cedi)");

  useEffect(() => {
    if (settings) {
      setProviderName(getSetting("provider_name"));
      setProviderAddress(getSetting("provider_address"));
      setProviderPhone(getSetting("provider_phone"));
      setProviderEmail(getSetting("provider_email"));
      setTaxRate(getSetting("withholding_tax_rate") || "5");
      setCurrency(getSetting("currency") || "GH¢ (Ghana Cedi)");
    }
  }, [settings]);

  const saveSetting = async (key: string, value: string) => {
    const existing = settings?.find?.((s: any) => s.key === key);
    if (existing) {
      await (supabase.from("system_settings") as any).update({ value, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await (supabase.from("system_settings") as any).insert({ key, value });
    }
    refetch();
  };

  const handleSaveProvider = async () => {
    await Promise.all([
      saveSetting("provider_name", providerName),
      saveSetting("provider_address", providerAddress),
      saveSetting("provider_phone", providerPhone),
      saveSetting("provider_email", providerEmail),
    ]);
    toast({ title: "Provider information saved" });
  };

  const handleSaveTax = async () => {
    await saveSetting("withholding_tax_rate", taxRate);
    toast({ title: "Tax rate updated", description: `New rate: ${taxRate}%` });
  };

  const handleSaveCurrency = async () => {
    await saveSetting("currency", currency);
    toast({ title: "Currency saved" });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="page-header">
        <h1 className="page-title">System Settings</h1>
        <p className="page-description">Configure system-wide settings and preferences</p>
      </div>

      <Tabs defaultValue="provider">
        <TabsList>
          <TabsTrigger value="provider">Provider Info</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="tax">Tax Configuration</TabsTrigger>
          <TabsTrigger value="email">Email (SMTP)</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="provider" className="space-y-4 mt-4">
          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Provider / Company Information
            </h3>
            <p className="text-xs text-muted-foreground">This information will appear on all exported documents (pre-authorizations, reports, etc.)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Provider/Company Name</Label><Input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="e.g. MedClaims Facility" className="mt-1" /></div>
              <div><Label>Email</Label><Input type="email" value={providerEmail} onChange={(e) => setProviderEmail(e.target.value)} placeholder="info@company.com" className="mt-1" /></div>
              <div><Label>Address</Label><Input value={providerAddress} onChange={(e) => setProviderAddress(e.target.value)} placeholder="P.O. Box 123, Accra" className="mt-1" /></div>
              <div><Label>Phone</Label><Input value={providerPhone} onChange={(e) => setProviderPhone(e.target.value)} placeholder="+233 XX XXX XXXX" className="mt-1" /></div>
            </div>
            <Button size="sm" onClick={handleSaveProvider}>Save Provider Info</Button>
          </div>
        </TabsContent>

        <TabsContent value="general" className="space-y-4 mt-4">
          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              Organization Logo
            </h3>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg bg-muted border-2 border-dashed border-border flex items-center justify-center">
                <Upload className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <Button variant="outline" size="sm">Upload Logo</Button>
                <p className="text-xs text-muted-foreground mt-1">PNG, SVG, or JPG (max 2MB)</p>
              </div>
            </div>
          </div>

          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Currency
            </h3>
            <div className="max-w-xs">
              <Label>Default Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1" />
            </div>
            <Button size="sm" onClick={handleSaveCurrency}>Save Currency</Button>
          </div>
        </TabsContent>

        <TabsContent value="tax" className="space-y-4 mt-4">
          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary" />
              Withholding Tax Rate
            </h3>
            <div className="max-w-xs space-y-3">
              <div>
                <Label>Tax Rate (%)</Label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1" />
              </div>
              <Button size="sm" onClick={handleSaveTax}>Save Rate</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This rate is auto-applied when submitting monthly claims. WHT is automatically calculated.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="email" className="space-y-4 mt-4">
          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              SMTP Configuration
            </h3>
            <div className="grid grid-cols-2 gap-4 max-w-lg">
              <div><Label>SMTP Host</Label><Input placeholder="smtp.gmail.com" className="mt-1" /></div>
              <div><Label>Port</Label><Input placeholder="587" className="mt-1" /></div>
              <div><Label>Username</Label><Input placeholder="your@email.com" className="mt-1" /></div>
              <div><Label>Password</Label><Input type="password" placeholder="••••••••" className="mt-1" /></div>
            </div>
            <Button size="sm">Save Configuration</Button>
          </div>
        </TabsContent>

        <TabsContent value="backup" className="space-y-4 mt-4">
          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold">Backup Settings</h3>
            <p className="text-sm text-muted-foreground">Automatic daily backups are enabled via Lovable Cloud.</p>
            <Button variant="outline" size="sm">Manual Backup Now</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
