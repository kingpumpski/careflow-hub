import { useState, useEffect, useRef } from "react";
import { Upload, Percent, DollarSign, Mail, Building2, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { data: settings, refetch } = useSupabaseQuery("system_settings");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getSetting = (key: string) => settings?.find?.((s: any) => s.key === key)?.value || "";

  const [providerName, setProviderName] = useState("");
  const [providerAddress, setProviderAddress] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [providerEmail, setProviderEmail] = useState("");
  const [taxRate, setTaxRate] = useState("5");
  const [currency, setCurrency] = useState("GH¢ (Ghana Cedi)");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // SMTP / Hospital email settings
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState("tls");
  const [claimsDepartment, setClaimsDepartment] = useState("Claims Department");
  const [claimsSenderEmail, setClaimsSenderEmail] = useState("");
  const [claimsReplyTo, setClaimsReplyTo] = useState("");
  const [claimsCcEmails, setClaimsCcEmails] = useState("");
  const [officerName, setOfficerName] = useState("");
  const [officerPosition, setOfficerPosition] = useState("");
  const [officerPhone, setOfficerPhone] = useState("");

  useEffect(() => {
    if (settings) {
      setProviderName(getSetting("provider_name"));
      setProviderAddress(getSetting("provider_address"));
      setProviderPhone(getSetting("provider_phone"));
      setProviderEmail(getSetting("provider_email"));
      setTaxRate(getSetting("withholding_tax_rate") || "5");
      setCurrency(getSetting("currency") || "GH¢ (Ghana Cedi)");
      setLogoUrl(getSetting("logo_url"));
      setSmtpHost(getSetting("smtp_host"));
      setSmtpPort(getSetting("smtp_port") || "587");
      setSmtpUser(getSetting("smtp_user"));
      setSmtpPassword(getSetting("smtp_password"));
      setSmtpSecure(getSetting("smtp_secure") || "tls");
      setClaimsDepartment(getSetting("claims_department") || "Claims Department");
      setClaimsSenderEmail(getSetting("claims_sender_email"));
      setClaimsReplyTo(getSetting("claims_reply_to"));
      setClaimsCcEmails(getSetting("claims_cc_emails"));
      setOfficerName(getSetting("officer_name"));
      setOfficerPosition(getSetting("officer_position"));
      setOfficerPhone(getSetting("officer_phone"));
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `company-logo.${ext}`;
      // Remove old logo if exists
      await supabase.storage.from("logos").remove([path]);
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
      const url = urlData.publicUrl + "?t=" + Date.now();
      await saveSetting("logo_url", url);
      setLogoUrl(url);
      toast({ title: "Logo uploaded successfully" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
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

  const handleManualBackup = async () => {
    try {
      const tables = ["claims", "payments", "withholding_tax", "insurance_companies", "pre_authorizations", "patients", "doctors", "procedures"];
      const backup: Record<string, any> = { timestamp: new Date().toISOString(), version: "1.0" };
      for (const t of tables) {
        const { data } = await (supabase.from(t as any) as any).select("*");
        backup[t] = data || [];
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medclaims-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Backup downloaded" });
    } catch (err: any) {
      toast({ title: "Backup failed", description: err.message, variant: "destructive" });
    }
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
            <p className="text-xs text-muted-foreground">This information will appear on all exported documents</p>
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
              <div className="w-20 h-20 rounded-lg bg-muted border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Upload className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</> : "Upload Logo"}
                </Button>
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
              This rate is auto-applied when submitting monthly claims. WHT is automatically calculated as: WHT = Tax Rate × Net Claim Amount.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="email" className="space-y-4 mt-4">
          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              SMTP Configuration
            </h3>
            <p className="text-xs text-muted-foreground">Used by Pre-Authorization "Complete Request" to send the request to insurers. Leave blank to fall back to your local mail client (mailto).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>SMTP Host</Label><Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className="mt-1" /></div>
              <div><Label>SMTP Port</Label><Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className="mt-1" /></div>
              <div><Label>Username</Label><Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="user@hospital.com" className="mt-1" /></div>
              <div><Label>Password / App Key</Label><Input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder="••••••••" className="mt-1" /></div>
              <div>
                <Label>Encryption</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={smtpSecure} onChange={(e) => setSmtpSecure(e.target.value)}>
                  <option value="tls">STARTTLS (587)</option>
                  <option value="ssl">SSL (465)</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
            <Button size="sm" onClick={async () => {
              await Promise.all([
                saveSetting("smtp_host", smtpHost),
                saveSetting("smtp_port", smtpPort),
                saveSetting("smtp_user", smtpUser),
                saveSetting("smtp_password", smtpPassword),
                saveSetting("smtp_secure", smtpSecure),
              ]);
              toast({ title: "SMTP settings saved" });
            }}>Save SMTP</Button>
          </div>

          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Hospital Claims Department
            </h3>
            <p className="text-xs text-muted-foreground">Sender identity for pre-authorization emails. CC emails are added on every outbound request.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Department Name</Label><Input value={claimsDepartment} onChange={(e) => setClaimsDepartment(e.target.value)} className="mt-1" /></div>
              <div><Label>Sender Email (From)</Label><Input type="email" value={claimsSenderEmail} onChange={(e) => setClaimsSenderEmail(e.target.value)} placeholder="claims@hospital.com" className="mt-1" /></div>
              <div><Label>Reply-To Email</Label><Input type="email" value={claimsReplyTo} onChange={(e) => setClaimsReplyTo(e.target.value)} placeholder="claims@hospital.com" className="mt-1" /></div>
              <div><Label>Hospital CC Emails (comma-separated)</Label><Input value={claimsCcEmails} onChange={(e) => setClaimsCcEmails(e.target.value)} placeholder="director@h.com, audit@h.com" className="mt-1" /></div>
              <div><Label>Officer Name</Label><Input value={officerName} onChange={(e) => setOfficerName(e.target.value)} className="mt-1" /></div>
              <div><Label>Officer Position</Label><Input value={officerPosition} onChange={(e) => setOfficerPosition(e.target.value)} className="mt-1" /></div>
              <div><Label>Officer Phone</Label><Input value={officerPhone} onChange={(e) => setOfficerPhone(e.target.value)} className="mt-1" /></div>
            </div>
            <Button size="sm" onClick={async () => {
              await Promise.all([
                saveSetting("claims_department", claimsDepartment),
                saveSetting("claims_sender_email", claimsSenderEmail),
                saveSetting("claims_reply_to", claimsReplyTo),
                saveSetting("claims_cc_emails", claimsCcEmails),
                saveSetting("officer_name", officerName),
                saveSetting("officer_position", officerPosition),
                saveSetting("officer_phone", officerPhone),
              ]);
              toast({ title: "Department settings saved" });
            }}>Save Department</Button>
          </div>
        </TabsContent>

        <TabsContent value="backup" className="space-y-4 mt-4">
          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Backup Settings
            </h3>
            <p className="text-sm text-muted-foreground">Automatic daily backups are enabled. You can also download a manual backup of all data.</p>
            <Button variant="outline" size="sm" onClick={handleManualBackup}>
              <Database className="w-4 h-4 mr-2" />
              Download Backup Now
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
