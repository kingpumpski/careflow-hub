export type PaymentReceiptSource = {
  insurance_company_id: string | null;
  payment_date: string | null;
  amount_paid: number | string | null;
};

export type PaymentReceiptMonthSummary = {
  insurance_company_id: string;
  receipt_month: string;
  receipt_year: number;
  receipt_month_number: number;
  net_cash_received: number;
  payment_count: number;
};

/**
 * Build receipt-month summaries from the production payments table.
 * The older production schema records payment_date, but does not have the
 * newer remittance ledger or a separate actual-WHT receipt date. WHT therefore
 * remains reported by claims period and is never inferred from payment month.
 */
export function summarizePaymentsByReceiptMonth(
  payments: readonly PaymentReceiptSource[],
): PaymentReceiptMonthSummary[] {
  const totals = new Map<string, PaymentReceiptMonthSummary>();

  for (const payment of payments) {
    if (!payment.insurance_company_id || !payment.payment_date) continue;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(payment.payment_date);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) continue;

    const amount = Number(payment.amount_paid ?? 0);
    if (!Number.isFinite(amount)) continue;

    const receiptMonth = `${match[1]}-${match[2]}-01`;
    const key = `${payment.insurance_company_id}:${receiptMonth}`;
    const existing = totals.get(key) ?? {
      insurance_company_id: payment.insurance_company_id,
      receipt_month: receiptMonth,
      receipt_year: year,
      receipt_month_number: month,
      net_cash_received: 0,
      payment_count: 0,
    };
    existing.net_cash_received += amount;
    existing.payment_count += 1;
    totals.set(key, existing);
  }

  return Array.from(totals.values()).sort((a, b) =>
    b.receipt_month.localeCompare(a.receipt_month)
    || a.insurance_company_id.localeCompare(b.insurance_company_id),
  );
}
