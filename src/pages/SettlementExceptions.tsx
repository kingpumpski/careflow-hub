import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getStoredFacilityId } from '@/features/preauth/services/preauthFacility.service';
import { detectSettlementExceptions, type SettlementException, type SettlementExceptionStatus } from '@/features/settlements/domain/settlement-exception-register';
import { useSupabaseInsert, useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { createSettlementException, transitionSettlementException } from '@/modules/offline/settlement-exception-repository';
import { getCareFlowDataMode } from '@/modules/offline/data-mode';

export default function SettlementExceptions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const facilityId = getStoredFacilityId();
  const offline = getCareFlowDataMode() === 'offline';
  const { data: periods } = useSupabaseQuery('claims_settlement_periods');
  const { data: exceptions } = useSupabaseQuery('settlement_exceptions');
  const insertException = useSupabaseInsert('settlement_exceptions');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const openExceptions = useMemo(() => (exceptions || []).filter((row: SettlementException) => row.status === 'open' || row.status === 'under_review'), [exceptions]);

  const scan = async () => {
    if (!facilityId || !user?.id) { toast({ title: 'Facility and user context required', description: 'Select a facility and sign in before scanning exceptions.', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const existingKeys = new Set((exceptions || []).map((row: SettlementException) => `${row.settlementPeriodId}:${row.type}`));
      let created = 0;
      for (const row of periods || []) {
        if (row.facility_id !== facilityId) continue;
        const detected = detectSettlementExceptions({ id: row.id, facilityId: row.facility_id, insuranceCompanyId: row.insurance_company_id, periodStart: row.period_start, periodEnd: row.period_end, periodType: row.period_type, totalClaimsSubmitted: Number(row.total_claims_submitted || 0), withholdingTaxRate: Number(row.withholding_tax_rate || 0), provisionalWithholdingTax: Number(row.provisional_withholding_tax || 0), paymentReceived: row.payment_received == null ? null : Number(row.payment_received), rejectionAmount: row.rejection_amount == null ? null : Number(row.rejection_amount), actualWithholdingTax: row.actual_withholding_tax == null ? null : Number(row.actual_withholding_tax), paymentAdviceReference: row.payment_advice_reference || null, paymentAdviceDate: row.payment_advice_date || null, settlementStatus: row.settlement_status, withholdingTaxVariance: row.withholding_tax_variance == null ? null : Number(row.withholding_tax_variance), confirmedBy: row.confirmed_by || null, confirmedAt: row.confirmed_at || null });
        for (const item of detected) {
          const key = `${item.settlementPeriodId}:${item.type}`;
          if (existingKeys.has(key)) continue;
          if (offline) {
            await createSettlementException({ ...item }, user.id);
          } else {
            await insertException.mutateAsync({ facility_id: item.facilityId, settlement_period_id: item.settlementPeriodId, type: item.type, severity: item.severity, status: item.status, title: item.title, reason: item.reason, officer_notes: item.officerNotes, resolution: item.resolution, resolved_at: item.resolvedAt, resolved_by: item.resolvedBy });
          }
          existingKeys.add(key); created += 1;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['settlement_exceptions'] });
      toast({ title: 'Exception scan completed', description: created ? `${created} new exception${created === 1 ? '' : 's'} recorded.` : 'No new exceptions were found.' });
    } catch (error: any) { toast({ title: 'Exception scan failed', description: error.message || 'Please try again.', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const transition = async (row: SettlementException, nextStatus: SettlementExceptionStatus) => {
    if (!user?.id) return;
    if ((nextStatus === 'resolved' || nextStatus === 'waived') && !notes[row.id]?.trim()) { toast({ title: 'Resolution required', description: 'Add a resolution note before closing an exception.', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      if (offline) {
        await transitionSettlementException({ exception: row, nextStatus, actorId: user.id, officerNotes: notes[row.id] || row.officerNotes, resolution: nextStatus === 'resolved' || nextStatus === 'waived' ? notes[row.id] : row.resolution });
      } else {
        throw new Error('Exception lifecycle audit is currently available in offline operational mode.');
      }
      await queryClient.invalidateQueries({ queryKey: ['settlement_exceptions'] });
      await queryClient.invalidateQueries({ queryKey: ['settlement_exception_audit_events'] });
      setNotes((current) => ({ ...current, [row.id]: '' }));
      toast({ title: 'Exception updated', description: `Exception moved to ${nextStatus.replaceAll('_', ' ')} and the action was audited.` });
    } catch (error: any) { toast({ title: 'Unable to update exception', description: error.message || 'Please try again.', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h1 className="page-title">Settlement Exception Register</h1><p className="page-description">Operational review queue for settlement exceptions detected from period-level data. No detailed claims or payment transactions are inferred.</p></div><Button disabled={busy} onClick={() => void scan()}><RefreshCw className="mr-2 h-4 w-4" />Scan settlements</Button></div>
    <section className="stat-card"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Open exceptions</h2><Badge variant="secondary">{openExceptions.length}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Lifecycle: Open → Under Review → Resolved or Waived.</p><div className="mt-4 space-y-4">{openExceptions.map((row: SettlementException) => <article key={row.id} className="rounded-lg border p-4 space-y-3"><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2"><Badge variant="outline">{row.severity}</Badge><Badge variant="secondary">{row.type.replaceAll('_', ' ')}</Badge><span className="font-medium">{row.title}</span></div><p className="mt-2 text-sm text-muted-foreground">{row.reason}</p></div><Badge>{row.status.replaceAll('_', ' ')}</Badge></div><Textarea placeholder="Officer notes / resolution" value={notes[row.id] || ''} onChange={(e) => setNotes((current) => ({ ...current, [row.id]: e.target.value }))} /><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || row.status !== 'open'} onClick={() => void transition(row, 'under_review')}>Start review</Button><Button size="sm" disabled={busy || row.status !== 'under_review'} onClick={() => void transition(row, 'resolved')}><CheckCircle2 className="mr-2 h-4 w-4" />Resolve</Button><Button size="sm" variant="outline" disabled={busy || row.status !== 'under_review'} onClick={() => void transition(row, 'waived')}>Waive</Button></div></article>)}{!openExceptions.length && <div className="py-8 text-center text-sm text-muted-foreground">No open settlement exceptions. Run a scan after recording new settlement information.</div>}</div></section>
    <section className="stat-card"><Label>Exception handling boundary</Label><p className="mt-2 text-sm text-muted-foreground">CareFlow records the exception, responsible officer, notes and resolution history. The external claims platform remains the source of truth for detailed claims and payment transactions.</p></section>
  </div>;
}
