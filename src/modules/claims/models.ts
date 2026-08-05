/** Canonical claims-intelligence domain interfaces used across dashboards, schedules and AI services. */

export interface InsuranceCompany {
  id: string;
  name: string;
  code: string | null;
  contact: string | null;
  status: "active" | "inactive";
}

export interface ClaimsSummary {
  id: string;
  insuranceCompanyId: string;
  month: number;
  year: number;
  claimsCount: number;
  submittedAmount: number;
  rejectedAmount: number;
  paymentReceived: number;
  outstandingAmount: number;
  rejectionRate: number;
  createdBy: string | null;
  createdAt: string;
}

export function mapInsuranceCompany(row: any): InsuranceCompany {
  return {
    id: row.id,
    name: row.company_name,
    code: row.contact_person ?? null,
    contact: row.phone ?? row.email ?? null,
    status: row.is_active === false ? "inactive" : "active",
  };
}

/** Aggregates raw claim + payment rows into monthly summaries (aggregate figures only). */
export function buildClaimsSummaries(claims: any[], payments: any[]): ClaimsSummary[] {
  const keys = new Set<string>();
  claims.forEach((c) => keys.add(`${c.insurance_company_id}|${c.claim_year}|${c.claim_month}`));
  payments.forEach((p) => keys.add(`${p.insurance_company_id}|${p.claim_year}|${p.claim_month}`));

  return Array.from(keys).map((key) => {
    const [insuranceCompanyId, year, month] = key.split("|");
    const scoped = claims.filter((c) => c.insurance_company_id === insuranceCompanyId && String(c.claim_year) === year && String(c.claim_month) === month);
    const submittedAmount = scoped.filter((c) => c.status !== "rejected").reduce((s, c) => s + Number(c.claim_amount || 0), 0);
    const rejectedAmount = scoped.filter((c) => c.status === "rejected").reduce((s, c) => s + Number(c.claim_amount || 0), 0);
    const paymentReceived = payments
      .filter((p) => p.insurance_company_id === insuranceCompanyId && String(p.claim_year) === year && String(p.claim_month) === month)
      .reduce((s, p) => s + Number(p.amount_paid || 0), 0);
    const gross = submittedAmount + rejectedAmount;
    return {
      id: key,
      insuranceCompanyId,
      month: Number(month),
      year: Number(year),
      claimsCount: scoped.length,
      submittedAmount,
      rejectedAmount,
      paymentReceived,
      outstandingAmount: submittedAmount - paymentReceived,
      rejectionRate: gross > 0 ? (rejectedAmount / gross) * 100 : 0,
      createdBy: null,
      createdAt: new Date().toISOString(),
    } as ClaimsSummary;
  });
}