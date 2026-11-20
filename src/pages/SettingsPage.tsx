import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, Percent, DollarSign, Mail, Building2, Database, Loader2, Send, Landmark, Plus, Trash2, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { parseBankingPartners, LETTERHEAD_STYLES } from "@/lib/letterhead";
import type { BankingPartner } from "@/lib/exportUtils";

type SystemBackup = {
  backup_id: string;
  created_at: string;
  encrypted_bytes: number;
  encrypted_sha256: string;
  database_bytes: number;
  storage_bucket_count: number;
  storage_object_count: number;
  verification: string;
  source_commit: string;
};

const formatBackupBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const SMTP_PRESETS: Record<string, { host: string; port: string; secure: string; hint: string }> = {
  gmail: { host: "smtp.gmail.com", port: "587", secure: "tls", hint: "Gmail requires 2-Step Verification and a 16-character App Password (not your normal password). Username is your full Gmail/Workspace address." },
  gmail_ssl: { host: "smtp.gmail.com", port: "465", secure: "ssl", hint: "Gmail over implicit SSL. Use an App Password as the password." },
  outlook: { host: "smtp.office365.com", port: "587", secure: "tls", hint: "Microsoft 365 / Outlook. SMTP AUTH must be enabled for the mailbox." },
  custom: { host: "", port: "587", secure: "tls", hint: "Enter your own mail server details." },
};

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

  const [systemBackups, setSystemBackups] = useState<SystemBackup[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupServiceError, setBackupServiceError] = useState<string | null>(null);

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
  const [smtpPreset, setSmtpPreset] = useState("custom");

  // Banking partners & letterhead design
  const [bankingPartners, setBankingPartners] = useState<BankingPartner[]>([]);
  const [letterheadAccent, setLetterheadAccent] = useState("#1E4078");
  const [letterheadStyle, setLetterheadStyle] = useState("bar");
  const [showBanking, setShowBanking] = useState(true);
  const [footerNote, setFooterNote] = useState("");

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
      setBankingPartners(parseBankingPartners(getSetting("banking_partners")));
      setLetterheadAccent(getSetting("letterhead_accent") || "#1E4078");
      setLetterheadStyle(getSetting("letterhead_style") || "bar");
      setShowBanking(getSetting("letterhead_show_banking") !== "false");
      setFooterNote(getSetting("letterhead_footer_note"));
      const host = getSetting("smtp_host");
      setSmtpPreset(
        host === "smtp.gmail.com" ? (getSetting("smtp_port") === "465" ? "gmail_ssl" : "gmail")
        : host === "smtp.office365.com" ? "outlook" : "custom"
      );
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
      const pageSize = 1000;
      const backup: Record<string, any> = {
        timestamp: new Date().toISOString(),
        version: "1.1",
        exportType: "partial-operational-table-export",
        includedTables: tables,
        tableCounts: {},
        limitations: [
          "This export includes only the eight listed tables.",
          "It does not include other database tables, Storage objects, Auth users, project settings, Edge Function configuration or secrets, or migration history.",
          "This file is not a complete or verified system backup and is not a supported production restore artifact.",
        ],
      };

      for (const table of tables) {
        const rows: any[] = [];
        let offset = 0;
        while (true) {
          const { data, error } = await (supabase.from(table as any) as any)
            .select("*")
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (error) throw new Error(`Unable to export ${table}: ${error.message}`);
          const page = data || [];
          rows.push(...page);
          if (page.length < pageSize) break;
          offset += pageSize;
        }
        backup[table] = rows;
        backup.tableCounts[table] = rows.length;
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `careflow-partial-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Partial export downloaded", description: "This file contains only the selected tables and is not a complete disaster-recovery backup." });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  const loadSystemBackups = useCallback(async () => {
    setBackupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("backup-control", { body: { action: "list" } });
      if (error) throw error;
      if (!Array.isArray(data?.backups)) throw new Error(data?.error || "Backup service returned an invalid response.");
      setSystemBackups(data.backups as SystemBackup[]);
      setBackupServiceError(null);
    } catch (error) {
      setBackupServiceError(error instanceof Error ? error.message : "Backup service is not available. Confirm the backup Edge Function and its secrets are deployed.");
    } finally {
      setBackupLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSystemBackups();
  }, [loadSystemBackups]);

  const handleRequestSystemBackup = async () => {
    setBackupRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("backup-control", { body: { action: "create" } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "The backup job could not be queued.");
      toast({ title: "Full-system backup queued", description: "The encrypted backup worker is running. Refresh this list after it completes." });
    } catch (error) {
      toast({ title: "Backup request failed", description: error instanceof Error ? error.message : "The backup job could not be queued.", variant: "destructive" });
    } finally {
      setBackupRunning(false);
    }
  };

  const handleDownloadSystemBackup = async (backupId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("backup-control", { body: { action: "download", backup_id: backupId } });
      if (error) throw error;
      if (typeof data?.download_url !== "string" || !data.download_url.startsWith("https://")) throw new Error("A secure download URL was not returned.");
      window.location.assign(data.download_url);
    } catch (error) {
      toast({ title: "Backup download failed", description: error instanceof Error ? error.message : "Unable to create a secure download link.", variant: "destructive" });
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

          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <Landmark className="w-4 h-4 text-primary" />
              Banking Partners
            </h3>
            <p className="text-xs text-muted-foreground">
              Displayed in the letterhead footer of pre-authorization documents and reports. The first two partners render with filled markers (primary); the rest use outlined markers.
            </p>

            {bankingPartners.length === 0 && (
              <p className="text-sm text-muted-foreground">No banking partners added yet.</p>
            )}

            <div className="space-y-3">
              {bankingPartners.map((b, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3 space-y-3 relative">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-3 h-3 rounded-full ${idx < 2 ? "bg-primary" : "border-2 border-primary"}`} />
                    <span className="text-xs font-medium text-muted-foreground">{idx < 2 ? "Primary" : "Secondary"} partner {idx + 1}</span>
                    <button
                      aria-label="Remove banking partner"
                      className="ml-auto p-1 rounded text-destructive hover:bg-destructive/10"
                      onClick={() => setBankingPartners(bankingPartners.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {([
                      ["bank_name", "Bank Name *", "e.g. Ecobank Ghana"],
                      ["account_name", "Account Name", "e.g. MedClaims Hospital Ltd"],
                      ["account_number", "Account Number", "e.g. 1441000123456"],
                      ["branch", "Branch", "e.g. Ridge Towers, Accra"],
                      ["swift", "SWIFT / BIC", "e.g. ECOCGHAC"],
                    ] as [keyof BankingPartner, string, string][]).map(([field, label, ph]) => (
                      <div key={field}>
                        <Label>{label}</Label>
                        <Input
                          value={(b[field] as string) || ""}
                          placeholder={ph}
                          className="mt-1"
                          onChange={(e) => setBankingPartners(bankingPartners.map((p, i) => i === idx ? { ...p, [field]: e.target.value } : p))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBankingPartners([...bankingPartners, { bank_name: "" }])}>
                <Plus className="w-4 h-4" />Add Banking Partner
              </Button>
              <Button size="sm" onClick={async () => {
                const clean = bankingPartners.filter((b) => (b.bank_name || "").trim());
                await saveSetting("banking_partners", JSON.stringify(clean));
                setBankingPartners(clean);
                toast({ title: "Banking partners saved", description: `${clean.length} partner(s) will appear on documents` });
              }}>Save Banking Partners</Button>
            </div>
          </div>

          <div className="stat-card space-y-4">
            <h3 className="font-heading font-semibold flex items-center gap-2">
              <PenTool className="w-4 h-4 text-primary" />
              Letterhead Designer
            </h3>
            <p className="text-xs text-muted-foreground">Controls the branded header and footer applied to pre-authorization documents and exported reports. The organization logo from the General tab is used automatically.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Accent Colour</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={letterheadAccent} onChange={(e) => setLetterheadAccent(e.target.value)} className="w-14 p-1 h-9" />
                  <Input value={letterheadAccent} onChange={(e) => setLetterheadAccent(e.target.value)} placeholder="#1E4078" />
                </div>
              </div>
              <div>
                <Label>Header Style</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={letterheadStyle} onChange={(e) => setLetterheadStyle(e.target.value)}>
                  {LETTERHEAD_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input id="show-banking" type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={showBanking} onChange={(e) => setShowBanking(e.target.checked)} />
                <Label htmlFor="show-banking" className="cursor-pointer">Show banking partners footer</Label>
              </div>
              <div>
                <Label>Footer Note</Label>
                <Input value={footerNote} onChange={(e) => setFooterNote(e.target.value)} placeholder="e.g. Accredited provider — all payments by bank transfer only" className="mt-1" />
              </div>
            </div>

            {/* Live letterhead preview */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {letterheadStyle === "bar" && <div className="h-1.5 w-full" style={{ backgroundColor: letterheadAccent }} />}
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {logoUrl && <img src={logoUrl} alt="Organization logo preview" className="w-12 h-12 object-contain" />}
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-base truncate" style={{ color: letterheadAccent }}>{providerName || "Medical Facility"}</p>
                    {providerAddress && <p className="text-xs text-muted-foreground">{providerAddress}</p>}
                    <p className="text-xs text-muted-foreground">
                      {[providerPhone && `Tel: ${providerPhone}`, providerEmail].filter(Boolean).join("   •   ")}
                    </p>
                  </div>
                </div>
                {letterheadStyle !== "minimal" && (
                  <div className="mt-3 space-y-0.5">
                    <div className="h-[2px] w-full" style={{ backgroundColor: letterheadAccent }} />
                    <div className="h-[1px] w-full" style={{ backgroundColor: letterheadAccent }} />
                  </div>
                )}
                <p className="mt-3 font-heading font-bold text-sm tracking-wide">PRE-AUTHORIZATION REQUEST</p>
                {showBanking && bankingPartners.some((b) => b.bank_name) && (
                  <div className="mt-5 pt-3 border-t" style={{ borderColor: letterheadAccent }}>
                    <p className="text-[10px] font-bold tracking-wider" style={{ color: letterheadAccent }}>BANKING PARTNERS</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {bankingPartners.filter((b) => b.bank_name).map((b, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span
                            className="mt-1 inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={i < 2 ? { backgroundColor: letterheadAccent } : { border: `2px solid ${letterheadAccent}` }}
                          />
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold truncate">{b.bank_name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {[b.account_name, b.account_number && `A/C ${b.account_number}`, b.branch, b.swift && `SWIFT ${b.swift}`].filter(Boolean).join(" • ")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {footerNote && <p className="text-[10px] text-muted-foreground mt-3">{footerNote}</p>}
              </div>
            </div>

            <Button size="sm" onClick={async () => {
              await Promise.all([
                saveSetting("letterhead_accent", letterheadAccent),
                saveSetting("letterhead_style", letterheadStyle),
                saveSetting("letterhead_show_banking", showBanking ? "true" : "false"),
                saveSetting("letterhead_footer_note", footerNote),
              ]);
              toast({ title: "Letterhead design saved" });
            }}>Save Letterhead Design</Button>
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
              <div>
                <Label>Email Provider</Label>
                <select
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={smtpPreset}
                  onChange={(e) => {
                    const key = e.target.value;
                    setSmtpPreset(key);
                    const preset = SMTP_PRESETS[key];
                    if (preset && key !== "custom") {
                      setSmtpHost(preset.host);
                      setSmtpPort(preset.port);
                      setSmtpSecure(preset.secure);
                    }
                  }}
                >
                  <option value="gmail">Gmail / Google Workspace (STARTTLS 587)</option>
                  <option value="gmail_ssl">Gmail / Google Workspace (SSL 465)</option>
                  <option value="outlook">Microsoft 365 / Outlook</option>
                  <option value="custom">Custom SMTP server</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-muted rounded-md p-3">{SMTP_PRESETS[smtpPreset]?.hint}</p>
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

            <div className="border-t border-border pt-4 mt-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2"><Send className="w-4 h-4 text-primary" />Send Test Email</h4>
              <p className="text-xs text-muted-foreground">Server-side SMTP testing is unavailable because this deployment does not include an email Edge Function.</p>
              <div className="flex flex-wrap items-end gap-3">
                <Button size="sm" disabled title="Restore and deploy a server-side email Edge Function to enable this test.">Email test unavailable</Button>
              </div>
            </div>
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-heading font-semibold flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  Full-system Backup Center
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Encrypted, off-site backup packages covering the Supabase database snapshot, Storage bucket files, migrations, Edge Function source and application source commit.</p>
              </div>
              <span className="text-xs rounded-full border px-2 py-1 text-muted-foreground">Admin only · encrypted</span>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-sm font-medium">Backup schedule</p>
              <p className="text-xs text-muted-foreground">A daily workflow is scheduled for 02:00 UTC and can also be started manually. It becomes operational only after the Supabase, GitHub and private R2 secrets are configured and the backup portal Edge Function is deployed. A backup is listed here only after the encrypted archive has been uploaded to off-site storage and its SHA-256 checksum has been verified.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleRequestSystemBackup} disabled={backupRunning}>
                  {backupRunning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Queuing...</> : <><Database className="w-4 h-4 mr-2" />Create Full Backup Now</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void loadSystemBackups()} disabled={backupLoading}>
                  {backupLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Refresh Backup List
                </Button>
              </div>
            </div>

            {backupServiceError && (
              <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
                <p className="text-sm font-medium">Backup service not yet available</p>
                <p className="text-xs text-muted-foreground">{backupServiceError}</p>
                <p className="text-xs text-muted-foreground">The Edge Function and off-site storage credentials must be configured before a backup can be generated or downloaded. This screen does not report a backup as complete unless a verified manifest is returned.</p>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Verified backup files</h4>
              {backupLoading && systemBackups.length === 0 ? (
                <p className="text-sm text-muted-foreground">Checking the backup repository...</p>
              ) : systemBackups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No verified full-system backups are currently available.</p>
              ) : (
                systemBackups.map((backup) => (
                  <div key={backup.backup_id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{new Date(backup.created_at).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Backup ID: {backup.backup_id}</p>
                      </div>
                      <span className="text-xs rounded-full border border-emerald-600/40 px-2 py-1 text-emerald-700 dark:text-emerald-400">SHA-256 verified</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div><p className="text-muted-foreground">Encrypted file</p><p className="font-medium">{formatBackupBytes(backup.encrypted_bytes)}</p></div>
                      <div><p className="text-muted-foreground">Database</p><p className="font-medium">{formatBackupBytes(backup.database_bytes)}</p></div>
                      <div><p className="text-muted-foreground">Storage buckets</p><p className="font-medium">{backup.storage_bucket_count}</p></div>
                      <div><p className="text-muted-foreground">Storage objects</p><p className="font-medium">{backup.storage_object_count}</p></div>
                    </div>
                    <p className="text-[11px] text-muted-foreground break-all">Encrypted SHA-256: {backup.encrypted_sha256}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">Source commit: {backup.source_commit?.slice(0, 12) || "unknown"}</p>
                      <Button size="sm" variant="outline" onClick={() => void handleDownloadSystemBackup(backup.backup_id)}>
                        <Database className="w-4 h-4 mr-2" />Download Encrypted Backup
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">Recovery is an operator-controlled process. Decrypt the archive using the offline age private key, restore the database through the Supabase-supported recovery path, then restore and verify Storage objects. Never upload the private key or service-role key to this browser.</p>
            <a className="text-sm text-primary underline underline-offset-4" href="https://github.com/kingpumpski/careflow-hub/blob/main/docs/BACKUP_AND_RESTORE.md" target="_blank" rel="noreferrer">Open full backup and recovery runbook</a>
          </div>

          <div className="stat-card space-y-3">
            <h3 className="font-heading font-semibold">Legacy Partial Export</h3>
            <p className="text-xs text-muted-foreground">This older convenience export contains only eight selected database tables. It is not encrypted, is not a complete system backup and cannot restore the project. Use it only for limited data review—not disaster recovery.</p>
            <Button variant="outline" size="sm" onClick={handleManualBackup}>
              <Database className="w-4 h-4 mr-2" />
              Download 8-table Partial Export
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
