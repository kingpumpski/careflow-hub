import { detectSettlementExceptions } from "@/features/settlements/domain/settlement-exceptions";
import { createOfflineSettlementException, listOfflineSettlementExceptions } from "./settlement-exception-repository";

/**
 * Detects and durably records settlement exceptions while the application is
 * operating offline. The detection input must contain the same financial
 * fields used by the online reconciliation path so offline and online
 * exception decisions cannot drift.
 *
 * A detection signature includes the severity and description so a resolved
 * exception can be re-raised when the underlying facts materially change,
 * while repeated refreshes of the same unchanged exception remain idempotent.
 */
export async function syncOfflineSettlementExceptions(periods: Array<any>, asOf = new Date()): Promise<number> {
  const existing = await listOfflineSettlementExceptions();
  const signature = (item: { settlementPeriodId: string; type: string; severity: string; description: string }) =>
    `${item.settlementPeriodId}:${item.type}:${item.severity}:${item.description}`;
  const keys = new Set(existing.map(signature));
  let created = 0;

  for (const period of periods) {
    if (!period.facility_id || !period.id) continue;

    const detected = detectSettlementExceptions({
      id: period.id,
      facilityId: period.facility_id,
      periodEnd: period.period_end,
      totalClaimsSubmitted: period.total_claims_submitted ?? 0,
      settlementStatus: period.settlement_status,
      actualWithholdingTax: period.actual_withholding_tax ?? null,
      paymentAdviceReference: period.payment_advice_reference ?? null,
      paymentAdviceDate: period.payment_advice_date ?? null,
      withholdingTaxVariance: period.withholding_tax_variance ?? null,
      paymentReceived: period.payment_received ?? null,
      rejectionAmount: period.rejection_amount ?? null,
    }, asOf);

    for (const candidate of detected) {
      const key = signature(candidate);
      if (keys.has(key)) continue;
      await createOfflineSettlementException({
        facilityId: period.facility_id,
        settlementPeriodId: candidate.settlementPeriodId,
        type: candidate.type,
        severity: candidate.severity,
        title: candidate.title,
        description: candidate.description,
        detectedAt: candidate.detectedAt,
        status: "open",
        assignedTo: null,
        resolutionNote: null,
        resolvedAt: null,
        resolvedBy: null,
      });
      keys.add(key);
      created += 1;
    }
  }

  return created;
}
