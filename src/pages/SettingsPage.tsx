import { Settings, Upload, Percent, DollarSign, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="page-header">
        <h1 className="page-title">System Settings</h1>
        <p className="page-description">Configure system-wide settings and preferences</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="tax">Tax Configuration</TabsTrigger>
          <TabsTrigger value="email">Email (SMTP)</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

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
              <Input defaultValue="GH¢ (Ghana Cedi)" className="mt-1" />
            </div>
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
                <Input type="number" defaultValue="5" className="mt-1" />
              </div>
              <Button size="sm">Save Rate</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              AI will monitor and suggest updates when tax rates are revised by authorities.
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
