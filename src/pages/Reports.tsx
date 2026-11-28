import { useState, useMemo, useCallback } from "react";
import { BarChart3, Download, Printer, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { buildLetterheadConfig } from "@/lib/letterhead";
import { buildReportPDFBlob, exportReportExcel } from "@/lib/exportUtils";
import { HtmlPrintPreviewDialog, PdfPreviewDialog } from "@/components/shared/DocumentPreviewDialogs";
import { toast } from "@/hooks/use-toast";
import { calculateAppliedWithholdingTax, calculateClaimGrossTotals, calculateWithholdingRateBasis } from "@/modules/reports/claimsReportCalculations";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";
import { summarizePaymentsByReceiptMonth } from "@/modules/settlements/receiptMonthSummary";
import { useDocumentLetterheadSettings } from "@/modules/reports/useDocumentLetterheadSettings";
import { usePermissions } from "@/modules/security/usePermissions";
import type { Permission } from "@/modules/security";
import SettlementReconciliationReport from "@/components/reports/SettlementReconciliationReport";
import { buildSettlementReconciliationRows } from "@/modules/reports/settlementReconciliationReport";
import OperationalPerformanceReport from "@/components/reports/OperationalPerformanceReport";
import { buildOperationalReportData } from "@/modules/reports/operationalReportCalculations";

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const periods = ["Monthly", "Quarterly", "Bi-Annual", "Annual", "Total"];
const percentLabel = (value: number | null) => value == null ? "—" : `${value.toFixed(1)}%`;
const REPORT_SOURCE_PERMISSIONS: Record<string, Permission[]> = {
  balance: ["claims.read", "payments.read"],
  income: ["ledger.read"],
  receivables: ["claims.read", "payments.read"],
  tax: ["claims.read", "payments.read", "ledger.read"],
  aging: ["claims.read", "payments.read"],
  receipts: ["payments.read"],
  settlement: ["payments.read"],
  operations: ["claims.read", "payments.read", "audit.read"],
};

export default function Reports() {
  const [activePeriod, setActivePeriod] = useState("Monthly");
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [activeReport, setActiveReport] = useState("balance");
  const [printPreviewHtml, setPrintPreviewHtml] = useState("");
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewName, setPdfPreviewName] = useState("report.pdf");
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("all");
  const { can } = usePermissions();
  const missingReportPermissions = (REPORT_SOURCE_PERMISSIONS[activeReport] || []).filter((permission) => !can(permission));
  const reportSourceAccessMissing = missingReportPermissions.length > 0;

  const { data: claims } = useSupabaseQuery("claims");
  const canReadAudit = can("audit.read");
  const canReadClaims = can("claims.read");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: payments } = useSupabaseQuery("payments");
  const { data: withholdingTax, error: withholdingTaxError } = useSupabaseQuery("withholding_tax", { missingSchemaBehavior: "error" });
  const { data: outstandingPeriods, error: outstandingPeriodsError } = useSupabaseQuery("claims_outstanding_periods", { missingSchemaBehavior: "error" });
  const { data: settlementPeriods, error: settlementPeriodsError } = useSupabaseQuery("claims_settlement_periods", { enabled: activeReport === "settlement" || activeReport === "operations", missingSchemaBehavior: "error" });
  const { data: auditLogs, error: auditLogsError } = useSupabaseQuery("audit_logs", { enabled: activeReport === "operations" && canReadAudit, orderBy: "changed_at", limit: 1000, missingSchemaBehavior: "error" });
  const { data: profiles } = useSupabaseQuery("profiles", { select: "id,full_name", enabled: activeReport === "operations" && canReadAudit });
  const { data: ledger } = useSupabaseQuery("ledger_entries");
  const { data: settings } = useDocumentLetterheadSettings({ canReadDocument: can("reports.read"), canManageSettings: can("settings.manage") });

  const companyInfo = buildLetterheadConfig((k: string) => settings?.find?.((s: any) => s.key === k)?.value || "");
  const settlementViewHasSeparatedTaxFields = Boolean(outstandingPeriods?.some((period: any) =>
    "provisional_withholding_tax_amount" in period || "actual_withholding_tax_amount" in period
  ));
  const settlementReportUnavailable = (
    Boolean(outstandingPeriodsError)
    || (Boolean(withholdingTaxError) && !settlementViewHasSeparatedTaxFields)
  ) && activeReport !== "income" && activeReport !== "receipts" && activeReport !== "settlement" && activeReport !== "operations";
  const filterByPeriod = useCallback((items: any[], yearKey: string, monthKey: string, dateKey?: string) => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);
    let filtered = items;
    if (activePeriod === "Monthly") {
      filtered = items.filter((i) => dateKey ? (new Date(i[dateKey]).getFullYear() === year && new Date(i[dateKey]).getMonth() + 1 === month) : (Number(i[yearKey]) === year && Number(i[monthKey]) === month));
    } else if (activePeriod === "Quarterly") {
      const qStart = Math.floor((month - 1) / 3) * 3 + 1;
      filtered = items.filter((i) => dateKey ? (new Date(i[dateKey]).getFullYear() === year && new Date(i[dateKey]).getMonth() + 1 >= qStart && new Date(i[dateKey]).getMonth() + 1 < qStart + 3) : (Number(i[yearKey]) === year && Number(i[monthKey]) >= qStart && Number(i[monthKey]) < qStart + 3));
    } else if (activePeriod === "Annual") {
      filtered = items.filter((i) => dateKey ? (new Date(i[dateKey]).getFullYear() === year) : (Number(i[yearKey]) === year));
    } else if (activePeriod === "Bi-Annual") {
      const half = month <= 6 ? [1, 6] : [7, 12];
      filtered = items.filter((i) => dateKey ? (new Date(i[dateKey]).getFullYear() === year && new Date(i[dateKey]).getMonth() + 1 >= half[0] && new Date(i[dateKey]).getMonth() + 1 <= half[1]) : (Number(i[yearKey]) === year && Number(i[monthKey]) >= half[0] && Number(i[monthKey]) <= half[1]));
    }
    return filtered;
  }, [activePeriod, selectedYear, selectedMonth]);

  const settlementCycleSourceRows = useMemo(() => {
    const periodRows = filterByPeriod(settlementPeriods || [], "", "", "period_start");
    return periodRows.filter((period: any) => selectedCompanyId === "all" || period.insurance_company_id === selectedCompanyId);
  }, [settlementPeriods, selectedCompanyId, filterByPeriod]);
  const settlementCycleRows = useMemo(
    () => buildSettlementReconciliationRows(settlementCycleSourceRows),
    [settlementCycleSourceRows],
  );
  const settlementCycleReportUnavailable = Boolean(settlementPeriodsError);

  const operationalClaims = useMemo(() => filterByPeriod(claims || [], "claim_year", "claim_month")
    .filter((claim: any) => selectedCompanyId === "all" || claim.insurance_company_id === selectedCompanyId),
  [claims, selectedCompanyId, filterByPeriod]);
  const operationalInsurers = useMemo(() => (insurers || [])
    .filter((insurer: any) => selectedCompanyId === "all" || insurer.id === selectedCompanyId),
  [insurers, selectedCompanyId]);
  const operationalSettlementPeriods = useMemo(() => filterByPeriod(settlementPeriods || [], "", "", "period_start")
    .filter((period: any) => selectedCompanyId === "all" || period.insurance_company_id === selectedCompanyId),
  [settlementPeriods, selectedCompanyId, filterByPeriod]);
  const operationalOutstandingPeriods = useMemo(() => filterByPeriod(outstandingPeriods || [], "period_year", "period_month")
    .filter((period: any) => selectedCompanyId === "all" || period.insurance_company_id === selectedCompanyId),
  [outstandingPeriods, selectedCompanyId, filterByPeriod]);
  const operationalAuditLogs = useMemo(() => {
    const periodLogs = filterByPeriod(auditLogs || [], "", "", "changed_at");
    if (!canReadClaims) return periodLogs;
    const selectedClaimIds = new Set(operationalClaims.map((claim: any) => String(claim.id)));
    return periodLogs.filter((log: any) => selectedClaimIds.has(String(log.record_id)));
  }, [auditLogs, filterByPeriod, operationalClaims, canReadClaims]);
  const operationalReportData = useMemo(() => buildOperationalReportData({
    claims: operationalClaims,
    insurers: operationalInsurers,
    payments: payments || [],
    settlementPeriods: operationalSettlementPeriods,
    outstandingPeriods: operationalOutstandingPeriods,
    auditLogs: operationalAuditLogs,
    profiles: profiles || [],
  }), [operationalClaims, operationalInsurers, payments, operationalSettlementPeriods, operationalOutstandingPeriods, operationalAuditLogs, profiles]);

  const reportData = useMemo(() => {
    const periodRows = filterByPeriod(outstandingPeriods || [], "period_year", "period_month");
    return (insurers || []).map((ins: any) => {
      const authoritative = periodRows.filter((period) => period.insurance_company_id === ins.id);
      const insurerClaims = filterByPeriod((claims || []).filter((c: any) => c.insurance_company_id === ins.id), "claim_year", "claim_month");
      const fallbackClaimTotals = calculateClaimGrossTotals(insurerClaims);
      const submittedGrossByPeriod = new Map<string, number>();
      insurerClaims.forEach((claim: any) => {
        const key = `${Number(claim.claim_year)}-${Number(claim.claim_month)}`;
        submittedGrossByPeriod.set(key, (submittedGrossByPeriod.get(key) || 0) + Number(claim.claim_amount || 0));
      });
      const insPayments = filterByPeriod((payments || []).filter((p: any) => p.insurance_company_id === ins.id), "claim_year", "claim_month");
      const insTax = filterByPeriod((withholdingTax || []).filter((t: any) => t.insurance_company_id === ins.id), "year", "month");
      const actualTaxRows = insTax.filter((taxRow) => taxRow.is_actual === true);
      const taxByPeriod = new Map<string, { actual: number; provisional: number; actualCount: number; provisionalCount: number }>();
      insTax.forEach((taxRow) => {
        const key = `${Number(taxRow.year)}-${Number(taxRow.month)}`;
        const periodTax = taxByPeriod.get(key) || { actual: 0, provisional: 0, actualCount: 0, provisionalCount: 0 };
        if (taxRow.is_actual === true) {
          periodTax.actual += Number(taxRow.tax_amount || 0);
          periodTax.actualCount += 1;
        } else {
          periodTax.provisional += Number(taxRow.tax_amount || 0);
          periodTax.provisionalCount += 1;
        }
        taxByPeriod.set(key, periodTax);
      });
      // The settlement-period view is authoritative for submitted, approved and
      // paid amounts. Provisional WHT remains a separate estimate and is never
      // treated as a receivable settlement. Raw tables remain a compatibility
      // fallback while the corrected view migration is awaiting production release.
      const submitted = authoritative.length
        ? authoritative.reduce((sum, period) => sum + Number(period.submitted_amount || 0), 0)
        : fallbackClaimTotals.submittedGross;
      const rejected = authoritative.length
        ? authoritative.reduce((sum, period) => sum + Number(period.rejected_amount || 0), 0)
        : fallbackClaimTotals.rejectedGross;
      const paid = authoritative.length
        ? authoritative.reduce((sum, period) => sum + Number(period.paid_amount || 0), 0)
        : insPayments.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0);
      const hasSeparatedTaxFields = authoritative.some((period) =>
        "provisional_withholding_tax_amount" in period || "actual_withholding_tax_amount" in period
      );
      // The older production view sums actual and provisional WHT together.
      // When its separate columns are absent, derive the applied amount from
      // the raw tax ledger: actual replaces provisional within each claims month.
      const fallbackTaxPeriods = Array.from(taxByPeriod.values());
      const provisionalTax = authoritative.length && hasSeparatedTaxFields
        ? authoritative.reduce((sum, period) => sum + Number(period.provisional_withholding_tax_amount || 0), 0)
        : fallbackTaxPeriods.reduce((sum, periodTax) => sum + periodTax.provisional, 0);
      const actualTax = authoritative.length && hasSeparatedTaxFields
        ? authoritative.reduce((sum, period) => sum + Number(period.actual_withholding_tax_amount || 0), 0)
        : fallbackTaxPeriods.reduce((sum, periodTax) => sum + periodTax.actual, 0);
      // Only certificate/advice-confirmed actual WHT is applied to receivables.
      // The provisional amount is visible for tax estimation, not collection. 
      const tax = actualTax;
      const approvedGrossRows = authoritative.filter((period) => period.approved_gross_amount != null);
      const approvedGross = authoritative.length > 0 && approvedGrossRows.length === authoritative.length
        ? approvedGrossRows.reduce((sum, period) => sum + Number(period.approved_gross_amount || 0), 0)
        : null;
      const approvalVarianceRows = authoritative.filter((period) => period.approval_variance != null);
      const approvalVariance = authoritative.length > 0 && approvalVarianceRows.length === authoritative.length
        ? approvalVarianceRows.reduce((sum, period) => sum + Number(period.approval_variance || 0), 0)
        : null;
      const netClaim = authoritative.length
        ? authoritative.reduce((sum, period) => sum + Number(period.net_claim_amount || 0), 0)
        : fallbackClaimTotals.netClaim;
      const outstanding = authoritative.length && hasSeparatedTaxFields
        ? authoritative.reduce((sum, period) => sum + Number(period.outstanding_amount || 0), 0)
        : Math.max(netClaim - paid - actualTax, 0);
      const fallbackTaxPeriodEntries = Array.from(taxByPeriod.entries());
      const hasActualAdvice = authoritative.length && hasSeparatedTaxFields
        ? authoritative.some((period) => period.outstanding_status === "actual")
        : fallbackTaxPeriodEntries.some(([, periodTax]) => periodTax.actualCount > 0);
      const hasProvisionalApplied = authoritative.length && hasSeparatedTaxFields
        ? authoritative.some((period) => period.outstanding_status === "provisional" && Number(period.withholding_tax_entry_count || 0) > 0)
        : fallbackTaxPeriodEntries.some(([, periodTax]) => periodTax.actualCount === 0 && periodTax.provisionalCount > 0);
      const hasTaxData = authoritative.length && hasSeparatedTaxFields
        ? authoritative.some((period) => Number(period.withholding_tax_entry_count || 0) > 0)
        : fallbackTaxPeriodEntries.length > 0;
      const actualBasisRows = authoritative.filter((period) => period.outstanding_status === "actual");
      const actualBasisAvailable = hasSeparatedTaxFields && actualBasisRows.length > 0
        && actualBasisRows.every((period) => period.approved_gross_amount != null);
      const actualBasisAmount = actualBasisAvailable
        ? actualBasisRows.reduce((sum, period) => sum + Number(period.approved_gross_amount || 0), 0)
        : null;
      const provisionalBasisAmount = authoritative.length && hasSeparatedTaxFields
        ? authoritative
          .filter((period) => period.outstanding_status === "provisional" && Number(period.withholding_tax_entry_count || 0) > 0)
          .reduce((sum, period) => sum + Number(period.submitted_amount || 0), 0)
        : fallbackTaxPeriodEntries.reduce((sum, [key, periodTax]) => (
          periodTax.actualCount === 0 && periodTax.provisionalCount > 0
            ? sum + (submittedGrossByPeriod.get(key) || 0)
            : sum
        ), 0);
      const taxBasis = calculateWithholdingRateBasis({
        actualBasisAmount,
        provisionalBasisAmount,
        provisionalTax,
        actualTax,
        hasActualAdvice,
        hasProvisionalApplied,
        hasTaxData,
      });
      return { id: ins.id, company: ins.company_name, submitted, rejected, netClaim, paid, tax, provisionalTax, actualTax, approvedGross, approvalVariance, outstanding, ...taxBasis, color: ins.color };
    }).filter((row) => row.submitted > 0 || row.paid > 0 || row.rejected > 0 || row.netClaim > 0 || row.outstanding > 0)
      .filter((row) => selectedCompanyId === "all" || row.id === selectedCompanyId);
  }, [claims, insurers, payments, withholdingTax, outstandingPeriods, selectedCompanyId, filterByPeriod]);

  // Ledger-based reports
  const incomeData = useMemo(() => {
    const filteredLedger = filterByPeriod((ledger || []).filter((entry) => selectedCompanyId === "all" || entry.insurance_company_id === selectedCompanyId), "claim_year", "claim_month");
    const revenue = filteredLedger.filter((e: any) => e.account_credit === "Claims Revenue").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const revAdj = filteredLedger.filter((e: any) => e.account_debit === "Revenue Adjustment").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const whtExp = filteredLedger.filter((e: any) => e.account_debit === "WHT Expense").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    return { revenue, revAdj, whtExp, netRevenue: revenue - revAdj, netIncome: revenue - revAdj };
  }, [ledger, selectedCompanyId, filterByPeriod]);

  const taxLiabilityData = useMemo(() => {
    const filteredLedger = filterByPeriod((ledger || []).filter((entry) => selectedCompanyId === "all" || entry.insurance_company_id === selectedCompanyId), "claim_year", "claim_month");
    const whtPayable = filteredLedger.filter((e: any) => e.account_credit === "WHT Payable").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const whtReversals = filteredLedger.filter((e: any) => e.account_debit === "WHT Payable").reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const taxCreditDebits = filteredLedger.filter((e) => e.account_debit === "Withholding Tax Receivable").reduce((s: number, e) => s + Number(e.amount || 0), 0);
    const taxCreditCredits = filteredLedger.filter((e) => e.account_credit === "Withholding Tax Receivable").reduce((s: number, e) => s + Number(e.amount || 0), 0);
    return { whtPayable, whtReversals, netLiability: whtPayable - whtReversals, taxCreditReceivable: taxCreditDebits - taxCreditCredits };
  }, [ledger, selectedCompanyId, filterByPeriod]);

  // Aging uses the same authoritative outstanding-period view as the balance
  // report, so approved gross and actual-vs-provisional WHT stay consistent.
  const agingData = useMemo(() => {
    const buckets = { b30: 0, b60: 0, b90: 0, b120: 0, b120plus: 0 };
    const today = new Date();
    const periodRows = (outstandingPeriods || []).filter((period) => selectedCompanyId === "all" || period.insurance_company_id === selectedCompanyId);
    periodRows.forEach((period) => {
      const outstanding = Number(period.outstanding_amount || 0);
      const year = Number(period.period_year);
      const month = Number(period.period_month);
      if (outstanding <= 0 || !year || month < 1 || month > 12) return;
      const periodEnd = new Date(year, month, 0);
      const days = Math.max(0, Math.floor((today.getTime() - periodEnd.getTime()) / 86400000));
      if (days <= 30) buckets.b30 += outstanding;
      else if (days <= 60) buckets.b60 += outstanding;
      else if (days <= 90) buckets.b90 += outstanding;
      else if (days <= 120) buckets.b120 += outstanding;
      else buckets.b120plus += outstanding;
    });
    return buckets;
  }, [outstandingPeriods, selectedCompanyId]);

  const receiptMonthData = filterByPeriod(
    summarizePaymentsByReceiptMonth(payments || []).filter((entry) => selectedCompanyId === "all" || entry.insurance_company_id === selectedCompanyId),
    "receipt_year",
    "receipt_month_number",
  );

  const { sorted: sortedReport, sort, handleSort } = useSort(reportData, "outstanding");

  const grandSubmitted = reportData.reduce((s, r) => s + r.submitted, 0);
  const grandRejected = reportData.reduce((s, r) => s + r.rejected, 0);
  const grandNet = reportData.reduce((s, r) => s + r.netClaim, 0);
  const grandPaid = reportData.reduce((s, r) => s + r.paid, 0);
  const grandTax = reportData.reduce((s, r) => s + r.tax, 0);
  const grandOutstanding = reportData.reduce((s, r) => s + r.outstanding, 0);
  const grandApprovedGross = reportData.length > 0 && reportData.every((r) => r.approvedGross != null)
    ? reportData.reduce((sum, r) => sum + Number(r.approvedGross || 0), 0)
    : null;
  const grandApprovalVariance = reportData.length > 0 && reportData.every((r) => r.approvalVariance != null)
    ? reportData.reduce((sum, r) => sum + Number(r.approvalVariance || 0), 0)
    : null;

  const handlePrint = (title: string) => {
    if (reportSourceAccessMissing || settlementReportUnavailable || (activeReport === "settlement" && settlementCycleReportUnavailable)) return;
    const source = document.getElementById("report-content");
    if (!source) return;
    const printable = source.cloneNode(true) as HTMLElement;
    printable.querySelectorAll('[role="tablist"], [role="tab"]').forEach((tab) => tab.remove());
    printable.querySelectorAll("button").forEach((button) => button.replaceWith(document.createTextNode(button.textContent?.trim() || "")));
    printable.querySelectorAll("svg").forEach((icon) => icon.remove());
    printable.querySelectorAll('[data-state="inactive"], [hidden]').forEach((node) => ((node as HTMLElement).style.display = "none"));
    const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
    const logo = companyInfo.logo_url ? `<img class="brand-logo" src="${escapeHtml(companyInfo.logo_url)}" alt="Company logo" />` : "";
    const companyName = companyInfo.provider_name || "Company information not configured";
    const contact = [companyInfo.provider_address, companyInfo.provider_phone, companyInfo.provider_email].filter(Boolean).map(escapeHtml).join(" &nbsp; | &nbsp; ");
    const generatedAt = new Date().toLocaleString();
    const selectedCompany = selectedCompanyId === "all" ? undefined : (insurers || []).find((company: any) => company.id === selectedCompanyId);
    const counterpartyDetails = selectedCompany ? [
      selectedCompany.address,
      selectedCompany.contact_person ? `Attn: ${selectedCompany.contact_person}` : null,
      selectedCompany.phone ? `Tel: ${selectedCompany.phone}` : null,
      selectedCompany.email,
    ].filter(Boolean).map(escapeHtml).join(" &nbsp; • &nbsp; ") : "";
    const counterpartySection = selectedCompany ? `<section class="counterparty"><div class="counterparty-label">PREPARED FOR</div><strong>${escapeHtml(selectedCompany.company_name)}</strong><div>${counterpartyDetails || "Company contact details not provided"}</div></section>` : "";
    const accentColor = /^#[0-9a-f]{6}$/i.test(companyInfo.accent_color || "")
      ? companyInfo.accent_color!
      : "#1E4078";
    const reconciliationTable = activeReport === "balance" && sortedReport.length ? `<section class="reconciliation-summary"><h2>Claims and WHT Reconciliation</h2><p class="section-note">Provisional WHT is shown as an estimate only. It does not reduce outstanding receivables; only confirmed actual WHT from insurer payment advice is applied.</p><table><thead><tr><th>Company</th><th>Submitted</th><th>Rejected</th><th>Approved Gross</th><th>Approval Variance</th><th>Paid</th><th>Provisional WHT</th><th>Actual WHT</th><th>WHT Applied</th><th>Outstanding</th></tr></thead><tbody>${sortedReport.map((row) => `<tr><td>${escapeHtml(row.company)}</td><td>GH¢ ${row.submitted.toLocaleString()}</td><td>GH¢ ${row.rejected.toLocaleString()}</td><td>${row.approvedGross == null ? "—" : `GH¢ ${row.approvedGross.toLocaleString()}`}</td><td>${row.approvalVariance == null ? "—" : `GH¢ ${row.approvalVariance.toLocaleString()}`}</td><td>GH¢ ${row.paid.toLocaleString()}</td><td>GH¢ ${row.provisionalTax.toLocaleString()}</td><td>GH¢ ${row.actualTax.toLocaleString()}</td><td>GH¢ ${row.tax.toLocaleString()}</td><td>GH¢ ${row.outstanding.toLocaleString()}</td></tr>`).join("")}</tbody><tfoot><tr><td>Grand Total</td><td>GH¢ ${grandSubmitted.toLocaleString()}</td><td>GH¢ ${grandRejected.toLocaleString()}</td><td>—</td><td>—</td><td>GH¢ ${grandPaid.toLocaleString()}</td><td>GH¢ ${sortedReport.reduce((sum, row) => sum + row.provisionalTax, 0).toLocaleString()}</td><td>GH¢ ${sortedReport.reduce((sum, row) => sum + row.actualTax, 0).toLocaleString()}</td><td>GH¢ ${grandTax.toLocaleString()}</td><td>GH¢ ${grandOutstanding.toLocaleString()}</td></tr></tfoot></table></section>` : "";
    const receiptTable = activeReport === "balance"
      ? `<section class="receipt-summary"><h2>Cash Received by Payment Month</h2><p class="section-note">Cash is grouped by the recorded payments.payment_date. Actual WHT remains grouped by the original claims month in the reconciliation above; the production schema does not store a separate actual-WHT receipt date.</p>${receiptMonthData.length ? `<table><thead><tr><th>Insurance Company</th><th>Payment Month</th><th>Cash Received</th><th>Payment Entries</th></tr></thead><tbody>${receiptMonthData.map((entry) => `<tr><td>${escapeHtml((insurers || []).find((ins) => ins.id === entry.insurance_company_id)?.company_name || "Unknown insurer")}</td><td>${escapeHtml(monthNames[Number(entry.receipt_month_number)] || entry.receipt_month)}</td><td>GH¢ ${Number(entry.net_cash_received || 0).toLocaleString()}</td><td>${Number(entry.payment_count || 0)}</td></tr>`).join("")}</tbody></table>` : `<p class="section-note">No payment records are available for the selected reporting period.</p>`}</section>`
      : "";
    setPrintPreviewHtml(`<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title><style>
      @page{size:A4 landscape;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;font-size:10px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .report-brand{display:flex;align-items:center;gap:16px;border-bottom:3px solid ${accentColor};padding:0 0 14px;margin-bottom:18px}
      .brand-logo{max-width:92px;max-height:64px;object-fit:contain}.brand-copy{flex:1}.brand-name{font-size:20px;font-weight:700;color:${accentColor};margin:0}.brand-contact{color:#526078;margin-top:4px;font-size:9px}
      .report-meta{display:flex;justify-content:space-between;gap:12px;margin:14px 0 18px;padding:10px 12px;background:#f2f5fa;border:1px solid #dce3ed;border-radius:6px}.counterparty{margin:0 0 14px;padding:10px 12px;background:#f8fafc;border:1px solid #dce3ed;border-radius:6px}.counterparty-label{font-size:7px;letter-spacing:.08em;color:#667085;font-weight:700;margin-bottom:4px}.counterparty strong{font-size:11px;color:#1e4078}.counterparty div:last-child{font-size:8px;color:#526078;margin-top:3px}
      h2,h3{color:#1e4078;margin:16px 0 8px}table{width:100%;border-collapse:collapse;margin:12px 0 18px;font-size:9px;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#1e4078!important;color:#fff!important;font-weight:700;text-align:left}th,td{border:1px solid #d7dee8;padding:7px 8px;vertical-align:top}tbody tr:nth-child(even){background:#f7f9fc}tfoot td{background:#eaf0f7;font-weight:700}.text-right{text-align:right}.font-bold,.font-semibold{font-weight:700}.text-destructive{color:#b42318}.text-success{color:#087443}.text-warning{color:#946200}.stat-card{border:1px solid #dce3ed;border-radius:6px;padding:12px;margin:8px 0;break-inside:avoid}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.report-footer{border-top:1px solid #d7dee8;padding-top:8px;margin-top:22px;color:#667085;font-size:8px}
      @media print{body{background:#fff}.no-print{display:none!important}}
    </style></head><body><header class="report-brand">${logo}<div class="brand-copy"><h1 class="brand-name">${escapeHtml(companyName)}</h1><div class="brand-contact">${contact}</div></div></header><div class="report-meta"><strong>${escapeHtml(title)}</strong><span>Company: ${escapeHtml(companyLabel)}</span><span>Period: ${escapeHtml(periodLabel)}</span><span>Generated: ${escapeHtml(generatedAt)}</span></div>${counterpartySection}${printable.outerHTML}${reconciliationTable}${receiptTable}<footer class="report-footer">${escapeHtml(companyInfo.footer_note || "Confidential financial report. For authorized business use only.")} &nbsp; | &nbsp; Generated by CareFlow Hub</footer></body></html>`);
    setPrintPreviewOpen(true);
  };

  const handleExportPDF = async () => {
    if (reportSourceAccessMissing || settlementReportUnavailable || (activeReport === "settlement" && settlementCycleReportUnavailable)) return;
    const reportName = activeReport === "balance" ? "Account Balance" : activeReport === "income" ? "Income Statement" : activeReport === "receivables" ? "Outstanding Receivables" : activeReport === "tax" ? "Tax Liability" : activeReport === "receipts" ? "Cash Receipts by Month" : activeReport === "settlement" ? "Settlement Reconciliation" : activeReport === "operations" ? "Operational Performance" : "Claim Aging";
    const title = `${periodLabel} — ${reportName}`;
    let data: (string | number)[][] = [];
    let columns: string[] = [];
    if (activeReport === "income") {
      columns = ["Income Statement Line", "Amount (GHS)"];
      data = [["Claims Revenue", incomeData.revenue], ["Revenue Adjustments", incomeData.revAdj], ["Net Revenue", incomeData.netRevenue], ["Provisional WHT Estimate (not an expense)", incomeData.whtExp], ["Net Income", incomeData.netIncome]];
    } else if (activeReport === "receivables") {
      columns = ["Company", "Net Claim (GHS)", "Paid (GHS)", "WHT Applied (GHS)", "Outstanding (GHS)", "Collected"];
      const receivables = sortedReport.filter((row) => row.outstanding > 0);
      data = receivables.map((row) => [row.company, row.netClaim, row.paid, row.tax, row.outstanding, row.netClaim > 0 ? `${(((row.paid + row.tax) / row.netClaim) * 100).toFixed(1)}%` : "—"]);
      data.push(["Grand Total", grandNet, grandPaid, grandTax, grandOutstanding, grandNet > 0 ? `${(((grandPaid + grandTax) / grandNet) * 100).toFixed(1)}%` : "—"]);
    } else if (activeReport === "tax") {
      columns = ["Company / Summary", "WHT Basis", "Tax Base (GHS)", "WHT Rate", "Provisional WHT (GHS)", "Actual WHT (GHS)", "WHT Applied (GHS)"];
      data = [
        ["WHT Payable", "—", "—", "—", "—", "—", taxLiabilityData.whtPayable],
        ["WHT Reversals", "—", "—", "—", "—", "—", taxLiabilityData.whtReversals],
        ["Net Tax Liability", "—", "—", "—", "—", "—", taxLiabilityData.netLiability],
        ["WHT Tax Credit Receivable", "Certificate-backed asset", "—", "—", "—", "—", taxLiabilityData.taxCreditReceivable],
        ...sortedReport.filter((row) => row.tax > 0).map((row) => [
          row.company,
          row.taxBasisLabel,
          row.taxBasisAmount ?? "—",
          row.taxRate == null ? "—" : `${(row.taxRate * 100).toFixed(2)}%`,
          row.provisionalTax,
          row.actualTax,
          row.tax,
        ]),
      ];
    } else if (activeReport === "operations") {
      columns = ["Report Area", "Item", "Count / Days", "Amount (GHS)", "Details"];
      data = [
        ...(canReadClaims ? operationalReportData.rejectionReasons.map((row) => ["Rejection Analysis", row.category, row.count, row.amount, row.reason]) : [["Rejection Analysis", "Access restricted", "—", "—", "Requires claims.read"]]),
        ...(canReadClaims ? operationalReportData.insurerPerformance.map((row) => ["Insurer Performance", row.insurer, row.claimsCount, row.submitted, `Claims cycles ${row.periodCount}; rejected ${row.rejected == null ? "—" : row.rejected}; cash ${row.paid == null ? "—" : row.paid}; balance ${row.outstanding == null ? "—" : row.outstanding}; denial ${percentLabel(row.denialRate)}; recovery ${percentLabel(row.recoveryRate)}; average days to pay ${row.averageDaysToPay == null ? "—" : row.averageDaysToPay.toFixed(1)}`]) : [["Insurer Performance", "Access restricted", "—", "—", "Requires claims.read"]]),
        ...(settlementPeriodsError ? [["Settlement Delays", "Source unavailable", "—", "—", "Settlement-period source could not be loaded"]] : operationalReportData.settlementDelays.map((row) => ["Settlement Delays", `${row.insurer} — ${row.claimsPeriod}`, row.daysPending ?? row.daysToAdvice ?? "—", "—", `${row.status}; pending days ${row.daysPending ?? "—"}; advice days ${row.daysToAdvice ?? "—"}; receipt days ${row.daysToReceipt ?? "—"}; advice ${row.adviceDate || "—"}; receipt ${row.receiptDate || "—"}`])),
        ...(canReadClaims ? (outstandingPeriodsError ? [["Outstanding Follow-up", "Source unavailable", "—", "—", "Outstanding-period source could not be loaded"]] : operationalReportData.outstandingFollowUp.map((row) => ["Outstanding Follow-up", `${row.insurer} — ${row.claimsMonth}`, row.daysOutstanding, row.outstanding, `${row.ageBand}; ${row.taxBasis}`])) : [["Outstanding Follow-up", "Access restricted", "—", "—", "Requires claims.read"]]),
        ...(!canReadAudit ? [["Staff Claims Activity", "Access restricted", "—", "—", "Requires audit.read"]] : auditLogsError ? [["Staff Claims Activity", "Source unavailable", "—", "—", "Audit source could not be loaded"]] : operationalReportData.staffActivity.map((row) => ["Staff Claims Activity", row.staffName, row.distinctClaimsTouched, "—", `Created ${row.inserts}; updated ${row.updates}; last activity ${row.lastActivity}`])),
      ];
    } else if (activeReport === "settlement") {
      columns = ["Claims Cycle", "Insurer", "Status", "Submitted (GHS)", "Approved Gross (GHS)", "Rejected (GHS)", "Approval Variance (GHS)", "Provisional WHT (GHS)", "Actual WHT (GHS)", "Cash Received (GHS)", "Approved Unpaid (GHS)", "Advice Reference", "Advice Date", "Receipt Date"];
      data = settlementCycleRows.map((row) => [
        row.periodStart, (insurers || []).find((ins: any) => ins.id === row.insuranceCompanyId)?.company_name || "Unknown insurer",
        row.status, row.submitted, row.approvedGross ?? "—", row.rejected ?? "—", row.approvalVariance ?? "—",
        row.provisionalWht, row.actualWht ?? "—", row.cashReceived ?? "—", row.approvedUnpaid ?? "—",
        row.adviceReference || "—", row.adviceDate || "—", row.receiptDate || "—",
      ]);
    } else if (activeReport === "receipts") {
      columns = ["Insurance Company", "Payment Month", "Cash Received (GHS)", "Payment Entries"];
      data = receiptMonthData.map((entry) => [
        (insurers || []).find((ins) => ins.id === entry.insurance_company_id)?.company_name || "Unknown insurer",
        `${monthNames[entry.receipt_month_number]} ${entry.receipt_year}`,
        entry.net_cash_received,
        entry.payment_count,
      ]);
      data.push(["Grand Total", "", receiptMonthData.reduce((sum, entry) => sum + entry.net_cash_received, 0), receiptMonthData.reduce((sum, entry) => sum + entry.payment_count, 0)]);
    } else if (activeReport === "aging") {
      columns = ["Aging Bucket", "Outstanding (GHS)"];
      data = [["0–30 days", agingData.b30], ["31–60 days", agingData.b60], ["61–90 days", agingData.b90], ["91–120 days", agingData.b120], ["120+ days", agingData.b120plus]];
      data.push(["Total Outstanding", Object.values(agingData).reduce((sum, value) => sum + value, 0)]);
    } else {
      columns = ["Company", "Submitted (GHS)", "Rejected (GHS)", "Approved Gross (GHS)", "Approval Variance (GHS)", "Paid (GHS)", "Provisional WHT (GHS)", "Actual WHT (GHS)", "WHT Applied (GHS)", "Outstanding (GHS)"];
      data = sortedReport.map(row => [row.company, row.submitted, row.rejected, row.approvedGross ?? "—", row.approvalVariance ?? "—", row.paid, row.provisionalTax, row.actualTax, row.tax, row.outstanding]);
      data.push(["Grand Total", grandSubmitted, grandRejected, "—", "—", grandPaid, sortedReport.reduce((sum, row) => sum + row.provisionalTax, 0), sortedReport.reduce((sum, row) => sum + row.actualTax, 0), grandTax, grandOutstanding]);
    }
    const selectedCompany = selectedCompanyId === "all" ? undefined : (insurers || []).find((company: any) => company.id === selectedCompanyId);
    const counterparty = selectedCompany ? {
      name: selectedCompany.company_name,
      address: selectedCompany.address,
      phone: selectedCompany.phone,
      email: selectedCompany.email,
      contactPerson: selectedCompany.contact_person,
    } : undefined;
    try {
      const blob = await buildReportPDFBlob(title, data, columns, companyInfo, counterparty);
      setPdfPreviewBlob(blob);
      setPdfPreviewName(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
      setPdfPreviewOpen(true);
    } catch (error) {
      toast({ title: "Unable to prepare PDF preview", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const handleExportExcel = () => {
    if (reportSourceAccessMissing || settlementReportUnavailable || (activeReport === "settlement" && settlementCycleReportUnavailable)) return;
    const reportName = activeReport === "balance" ? "Account Balance" : activeReport === "income" ? "Income Statement" : activeReport === "receivables" ? "Outstanding Receivables" : activeReport === "tax" ? "Tax Liability" : activeReport === "receipts" ? "Cash Receipts by Month" : activeReport === "settlement" ? "Settlement Reconciliation" : activeReport === "operations" ? "Operational Performance" : "Claim Aging";
    let rows: Record<string, string | number | null>[] = [];
    if (activeReport === "income") {
      rows = [{ "Income Statement Line": "Claims Revenue", "Amount (GHS)": incomeData.revenue }, { "Income Statement Line": "Revenue Adjustments", "Amount (GHS)": incomeData.revAdj }, { "Income Statement Line": "Net Revenue", "Amount (GHS)": incomeData.netRevenue }, { "Income Statement Line": "Provisional WHT Estimate (not an expense)", "Amount (GHS)": incomeData.whtExp }, { "Income Statement Line": "Net Income", "Amount (GHS)": incomeData.netIncome }];
    } else if (activeReport === "receivables") {
      rows = sortedReport.filter((row) => row.outstanding > 0).map((row) => ({ "Company": row.company, "Net Claim": row.netClaim, "Paid": row.paid, "WHT Applied": row.tax, "Outstanding": row.outstanding, "Collected %": row.netClaim > 0 ? Number((((row.paid + row.tax) / row.netClaim) * 100).toFixed(1)) : null }));
      rows.push({ "Company": "Grand Total", "Net Claim": grandNet, "Paid": grandPaid, "WHT Applied": grandTax, "Outstanding": grandOutstanding, "Collected %": grandNet > 0 ? Number((((grandPaid + grandTax) / grandNet) * 100).toFixed(1)) : null });
    } else if (activeReport === "tax") {
      rows = [
        { "Company / Summary": "WHT Payable", "WHT Basis": "—", "Tax Base (GHS)": null, "WHT Rate": "—", "Provisional WHT (GHS)": null, "Actual WHT (GHS)": null, "WHT Applied (GHS)": taxLiabilityData.whtPayable },
        { "Company / Summary": "WHT Reversals", "WHT Basis": "—", "Tax Base (GHS)": null, "WHT Rate": "—", "Provisional WHT (GHS)": null, "Actual WHT (GHS)": null, "WHT Applied (GHS)": taxLiabilityData.whtReversals },
        { "Company / Summary": "Net Tax Liability", "WHT Basis": "—", "Tax Base (GHS)": null, "WHT Rate": "—", "Provisional WHT (GHS)": null, "Actual WHT (GHS)": null, "WHT Applied (GHS)": taxLiabilityData.netLiability },
        { "Company / Summary": "WHT Tax Credit Receivable", "WHT Basis": "Certificate-backed asset", "Tax Base (GHS)": null, "WHT Rate": "—", "Provisional WHT (GHS)": null, "Actual WHT (GHS)": null, "WHT Applied (GHS)": taxLiabilityData.taxCreditReceivable },
        ...sortedReport.filter((row) => row.tax > 0).map((row) => ({
          "Company / Summary": row.company,
          "WHT Basis": row.taxBasisLabel,
          "Tax Base (GHS)": row.taxBasisAmount,
          "WHT Rate": row.taxRate == null ? "—" : `${(row.taxRate * 100).toFixed(2)}%`,
          "Provisional WHT (GHS)": row.provisionalTax,
          "Actual WHT (GHS)": row.actualTax,
          "WHT Applied (GHS)": row.tax,
        })),
      ];
    } else if (activeReport === "operations") {
      rows = [
        ...(canReadClaims ? operationalReportData.rejectionReasons.map((row) => ({ "Report Area": "Rejection Analysis", "Item": row.category, "Count / Days": row.count, "Amount (GHS)": row.amount, "Details": row.reason })) : [{ "Report Area": "Rejection Analysis", "Item": "Access restricted", "Count / Days": null, "Amount (GHS)": null, "Details": "Requires claims.read" }]),
        ...(canReadClaims ? operationalReportData.insurerPerformance.map((row) => ({ "Report Area": "Insurer Performance", "Item": row.insurer, "Count / Days": row.claimsCount, "Amount (GHS)": row.submitted, "Details": `Cycles ${row.periodCount}; rejected ${row.rejected == null ? "—" : row.rejected}; cash ${row.paid == null ? "—" : row.paid}; balance ${row.outstanding == null ? "—" : row.outstanding}; denial ${percentLabel(row.denialRate)}; recovery ${percentLabel(row.recoveryRate)}; average days to pay ${row.averageDaysToPay == null ? "—" : row.averageDaysToPay.toFixed(1)}` })) : [{ "Report Area": "Insurer Performance", "Item": "Access restricted", "Count / Days": null, "Amount (GHS)": null, "Details": "Requires claims.read" }]),
        ...(settlementPeriodsError ? [{ "Report Area": "Settlement Delays", "Item": "Source unavailable", "Count / Days": null, "Amount (GHS)": null, "Details": "Settlement-period source could not be loaded" }] : operationalReportData.settlementDelays.map((row) => ({ "Report Area": "Settlement Delays", "Item": `${row.insurer} — ${row.claimsPeriod}`, "Count / Days": row.daysPending ?? row.daysToAdvice, "Amount (GHS)": null, "Details": `${row.status}; pending days ${row.daysPending ?? "—"}; advice days ${row.daysToAdvice ?? "—"}; receipt days ${row.daysToReceipt ?? "—"}; advice ${row.adviceDate || "—"}; receipt ${row.receiptDate || "—"}` }))),
        ...(canReadClaims ? (outstandingPeriodsError ? [{ "Report Area": "Outstanding Follow-up", "Item": "Source unavailable", "Count / Days": null, "Amount (GHS)": null, "Details": "Outstanding-period source could not be loaded" }] : operationalReportData.outstandingFollowUp.map((row) => ({ "Report Area": "Outstanding Follow-up", "Item": `${row.insurer} — ${row.claimsMonth}`, "Count / Days": row.daysOutstanding, "Amount (GHS)": row.outstanding, "Details": `${row.ageBand}; ${row.taxBasis}` }))) : [{ "Report Area": "Outstanding Follow-up", "Item": "Access restricted", "Count / Days": null, "Amount (GHS)": null, "Details": "Requires claims.read" }]),
        ...(!canReadAudit ? [{ "Report Area": "Staff Claims Activity", "Item": "Access restricted", "Count / Days": null, "Amount (GHS)": null, "Details": "Requires audit.read" }] : auditLogsError ? [{ "Report Area": "Staff Claims Activity", "Item": "Source unavailable", "Count / Days": null, "Amount (GHS)": null, "Details": "Audit source could not be loaded" }] : operationalReportData.staffActivity.map((row) => ({ "Report Area": "Staff Claims Activity", "Item": row.staffName, "Count / Days": row.distinctClaimsTouched, "Amount (GHS)": null, "Details": `Created ${row.inserts}; updated ${row.updates}; last activity ${row.lastActivity}` }))),
      ];
    } else if (activeReport === "settlement") {
      rows = settlementCycleRows.map((row) => ({
        "Claims Cycle": row.periodStart,
        "Insurer": (insurers || []).find((ins: any) => ins.id === row.insuranceCompanyId)?.company_name || "Unknown insurer",
        "Status": row.status,
        "Submitted (GHS)": row.submitted,
        "Approved Gross (GHS)": row.approvedGross,
        "Rejected (GHS)": row.rejected,
        "Approval Variance (GHS)": row.approvalVariance,
        "Provisional WHT (GHS)": row.provisionalWht,
        "Actual WHT (GHS)": row.actualWht,
        "Cash Received (GHS)": row.cashReceived,
        "Approved Unpaid (GHS)": row.approvedUnpaid,
        "Advice Reference": row.adviceReference || "",
        "Advice Date": row.adviceDate || "",
        "Receipt Date": row.receiptDate || "",
      }));
    } else if (activeReport === "receipts") {
      rows = receiptMonthData.map((entry) => ({
        "Insurance Company": (insurers || []).find((ins) => ins.id === entry.insurance_company_id)?.company_name || "Unknown insurer",
        "Payment Month": `${monthNames[entry.receipt_month_number]} ${entry.receipt_year}`,
        "Cash Received (GHS)": entry.net_cash_received,
        "Payment Entries": entry.payment_count,
      }));
      rows.push({
        "Insurance Company": "Grand Total",
        "Payment Month": "",
        "Cash Received (GHS)": receiptMonthData.reduce((sum, entry) => sum + entry.net_cash_received, 0),
        "Payment Entries": receiptMonthData.reduce((sum, entry) => sum + entry.payment_count, 0),
      });
    } else if (activeReport === "aging") {
      rows = [{ "Aging Bucket": "0–30 days", "Outstanding": agingData.b30 }, { "Aging Bucket": "31–60 days", "Outstanding": agingData.b60 }, { "Aging Bucket": "61–90 days", "Outstanding": agingData.b90 }, { "Aging Bucket": "91–120 days", "Outstanding": agingData.b120 }, { "Aging Bucket": "120+ days", "Outstanding": agingData.b120plus }];
      rows.push({ "Aging Bucket": "Total Outstanding", "Outstanding": Object.values(agingData).reduce((sum, value) => sum + value, 0) });
    } else {
      rows = sortedReport.map(row => ({ "Insurance Company": row.company, "Submitted": row.submitted, "Rejected": row.rejected, "Net Claim": row.netClaim, "Approved Gross": row.approvedGross, "Approval Variance": row.approvalVariance, "Paid": row.paid, "Provisional WHT": row.provisionalTax, "Actual WHT": row.actualTax, "WHT Applied": row.tax, "Outstanding": row.outstanding }));
      rows.push({ "Insurance Company": "Grand Total", "Submitted": grandSubmitted, "Rejected": grandRejected, "Net Claim": grandNet, "Approved Gross": null, "Approval Variance": null, "Paid": grandPaid, "Provisional WHT": sortedReport.reduce((sum, row) => sum + row.provisionalTax, 0), "Actual WHT": sortedReport.reduce((sum, row) => sum + row.actualTax, 0), "WHT Applied": grandTax, "Outstanding": grandOutstanding });
    }
    exportReportExcel(`${periodLabel} - ${reportName}`, rows, "Report");
  };

  const companyLabel = selectedCompanyId === "all" ? "All Companies" : (insurers || []).find((company) => company.id === selectedCompanyId)?.company_name || "Selected Company";
  const periodLabel = `${activeReport === "aging" ? "All-Time Aging" : activePeriod === "Total" ? "All Time" : `${activePeriod} — ${selectedYear}${activePeriod === "Monthly" ? ` ${monthNames[parseInt(selectedMonth)]}` : ""}`} · ${companyLabel}`;

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div><h1 className="page-title flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" />Financial &amp; Operational Reports</h1><p className="page-description">Generate financial statements, claims-cycle reconciliations and operational performance reports</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrint(periodLabel)} disabled={reportSourceAccessMissing || settlementReportUnavailable || (activeReport === "settlement" && settlementCycleReportUnavailable)} title={settlementReportUnavailable || (activeReport === "settlement" && settlementCycleReportUnavailable) ? "The selected report source is unavailable; printing is disabled to prevent incomplete financial figures." : undefined}><Printer className="w-4 h-4" />Print</Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportPDF} disabled={reportSourceAccessMissing || settlementReportUnavailable || (activeReport === "settlement" && settlementCycleReportUnavailable)} title={reportSourceAccessMissing ? "Additional source permissions are required before this report can be exported." : settlementReportUnavailable || (activeReport === "settlement" && settlementCycleReportUnavailable) ? "The selected report source is unavailable; PDF export is disabled." : undefined}><Download className="w-4 h-4" />PDF</Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportExcel} disabled={reportSourceAccessMissing || settlementReportUnavailable || (activeReport === "settlement" && settlementCycleReportUnavailable)} title={reportSourceAccessMissing ? "Additional source permissions are required before this report can be exported." : settlementReportUnavailable || (activeReport === "settlement" && settlementCycleReportUnavailable) ? "The selected report source is unavailable; Excel export is disabled." : undefined}><Download className="w-4 h-4" />Excel</Button>
        </div>
      </div>

      {reportSourceAccessMissing && <div role="alert" className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning">This report needs additional data permissions: {missingReportPermissions.join(", ")}. Ask an administrator to grant the required scoped access. Report figures and exports are withheld until the source permissions are available.</div>}
      {settlementReportUnavailable && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Claims settlement report data is unavailable. Financial totals are not zero; printing and exports are disabled until the settlement source is restored.</div>}
      {activeReport === "balance" && !settlementReportUnavailable && <div role="status" className="rounded-md border p-3 text-sm text-muted-foreground">Cash receipts are grouped by recorded payment date. Actual withholding tax is grouped by claims period because the connected production schema does not record a separate tax receipt date.</div>}

      <div className="flex items-center gap-2 flex-wrap">
        {periods.map((p) => <Button key={p} variant={p === activePeriod ? "default" : "outline"} size="sm" onClick={() => setActivePeriod(p)}>{p}</Button>)}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2"><Label htmlFor="report-company" className="text-xs">Company:</Label><select id="report-company" className="h-8 min-w-52 rounded-md border border-input bg-background px-2 text-sm" value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}><option value="all">All companies (consolidated)</option>{(insurers || []).map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}</select></div>
        {activePeriod !== "Total" && <div className="flex items-center gap-2"><Label className="text-xs">Year:</Label><Input type="number" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-24 h-8" /></div>}
        {(activePeriod === "Monthly" || activePeriod === "Quarterly" || activePeriod === "Bi-Annual") && (
          <div className="flex items-center gap-2"><Label className="text-xs">Month:</Label><select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>{monthNames.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div>
        )}
      </div>

      <Tabs value={activeReport} onValueChange={setActiveReport}>
        <TabsList>
          <TabsTrigger value="balance">Account Balance</TabsTrigger>
          <TabsTrigger value="income">Income Statement</TabsTrigger>
          <TabsTrigger value="receivables">Outstanding Receivables</TabsTrigger>
          <TabsTrigger value="tax">Tax Liability</TabsTrigger>
          <TabsTrigger value="aging">Claim Aging</TabsTrigger>
          <TabsTrigger value="receipts">Cash Receipts by Month</TabsTrigger>
          <TabsTrigger value="settlement">Settlement Reconciliation</TabsTrigger>
          <TabsTrigger value="operations">Operational Performance</TabsTrigger>
        </TabsList>

        {reportSourceAccessMissing ? (
          <div role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <h2 className="font-semibold text-destructive">Report data access is incomplete</h2>
            <p className="mt-1 text-muted-foreground">This report requires additional source permissions. No claims or financial rows are exposed by weakening database security, and exports are disabled until access is granted.</p>
            <p className="mt-2 font-medium">Required permissions: {missingReportPermissions.join(", ")}</p>
          </div>
        ) : (
          <div id="report-content" className="mt-4">
          <TabsContent value="balance">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="stat-card text-center"><p className="text-2xl font-bold font-heading">{settlementReportUnavailable ? "—" : `GH¢ ${grandSubmitted.toLocaleString()}`}</p><p className="text-xs text-muted-foreground mt-1">Submitted</p></div>
              <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-success">{settlementReportUnavailable ? "—" : `GH¢ ${grandPaid.toLocaleString()}`}</p><p className="text-xs text-muted-foreground mt-1">Paid</p></div>
              <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-warning">{settlementReportUnavailable ? "—" : `GH¢ ${grandTax.toLocaleString()}`}</p><p className="text-xs text-muted-foreground mt-1">WHT</p></div>
              <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-destructive">{settlementReportUnavailable ? "—" : `GH¢ ${grandOutstanding.toLocaleString()}`}</p><p className="text-xs text-muted-foreground mt-1">Outstanding</p></div>
            </div>
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-4">{periodLabel} — Account Balance Report</h3>
              <table className="data-table">
                <thead><tr>
                  <SortableHeader label="Company" sortKey="company" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Submitted" sortKey="submitted" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Rejected" sortKey="rejected" currentSort={sort} onSort={handleSort} />
                  <th>Approved Gross</th>
                  <th>Approval Variance</th>
                  <SortableHeader label="Net Claim" sortKey="netClaim" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Paid" sortKey="paid" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="WHT" sortKey="tax" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Outstanding" sortKey="outstanding" currentSort={sort} onSort={handleSort} />
                </tr></thead>
                <tbody>
                  {sortedReport.map((r) => (
                    <tr key={r.company} className="hover:bg-muted/50 transition-colors">
                      <td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#3b82f6" }} />{r.company}</div></td>
                      <td>GH¢ {r.submitted.toLocaleString()}</td>
                      <td className="text-destructive">GH¢ {r.rejected.toLocaleString()}</td>
                      <td>{r.approvedGross == null ? "—" : `GH¢ ${r.approvedGross.toLocaleString()}`}</td>
                      <td>{r.approvalVariance == null ? "—" : `GH¢ ${r.approvalVariance.toLocaleString()}`}</td>
                      <td className="font-medium">GH¢ {r.netClaim.toLocaleString()}</td>
                      <td className="text-success">GH¢ {r.paid.toLocaleString()}</td>
                      <td className="text-warning">GH¢ {r.tax.toLocaleString()}</td>
                      <td className="text-destructive font-semibold">GH¢ {r.outstanding.toLocaleString()}</td>
                    </tr>
                  ))}
                  {sortedReport.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">{settlementReportUnavailable ? "Settlement data is unavailable; this is not a zero balance." : "No data for selected period"}</td></tr>}
                </tbody>
                {sortedReport.length > 0 && (
                  <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>GH¢ {grandSubmitted.toLocaleString()}</td><td className="text-destructive">GH¢ {grandRejected.toLocaleString()}</td><td>{grandApprovedGross == null ? "—" : `GH¢ ${grandApprovedGross.toLocaleString()}`}</td><td>{grandApprovalVariance == null ? "—" : `GH¢ ${grandApprovalVariance.toLocaleString()}`}</td><td>GH¢ {grandNet.toLocaleString()}</td><td className="text-success">GH¢ {grandPaid.toLocaleString()}</td><td className="text-warning">GH¢ {grandTax.toLocaleString()}</td><td className="text-destructive">GH¢ {grandOutstanding.toLocaleString()}</td></tr></tfoot>
                )}
              </table>
            </div>
          </TabsContent>

          <TabsContent value="income">
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />{periodLabel} — Income Statement</h3>
              <table className="data-table">
                <tbody>
                  <tr className="bg-muted/20"><td colSpan={2} className="font-bold">Revenue</td></tr>
                  <tr><td className="pl-8">Claims Revenue</td><td className="text-right font-semibold">GH¢ {incomeData.revenue.toLocaleString()}</td></tr>
                  <tr><td className="pl-8 text-destructive">Less: Revenue Adjustments (Rejections)</td><td className="text-right text-destructive">(GH¢ {incomeData.revAdj.toLocaleString()})</td></tr>
                  <tr className="font-bold border-t"><td className="pl-4">Net Revenue</td><td className="text-right">GH¢ {incomeData.netRevenue.toLocaleString()}</td></tr>
                  <tr><td colSpan={2}>&nbsp;</td></tr>
                  <tr className="bg-muted/20"><td colSpan={2} className="font-bold">Tax information (not an expense)</td></tr>
                  <tr><td className="pl-8 text-muted-foreground">Provisional WHT estimate — memo only</td><td className="text-right text-muted-foreground">GH¢ {incomeData.whtExp.toLocaleString()}</td></tr>
                  <tr><td colSpan={2}>&nbsp;</td></tr>
                  <tr className="font-bold text-lg border-t-2 bg-success/5"><td>Net Income</td><td className="text-right text-success">GH¢ {incomeData.netIncome.toLocaleString()}</td></tr>
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="receivables">
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-4">{periodLabel} — Outstanding Receivables Report</h3>
              <table className="data-table">
                <thead><tr><th>Company</th><th>Net Claim</th><th>Paid</th><th>WHT</th><th>Outstanding</th><th>% Collected</th></tr></thead>
                <tbody>
                  {sortedReport.filter(r => r.outstanding > 0).map((r) => (
                    <tr key={r.company} className="hover:bg-muted/50 transition-colors">
                      <td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#3b82f6" }} />{r.company}</div></td>
                      <td>GH¢ {r.netClaim.toLocaleString()}</td>
                      <td className="text-success">GH¢ {r.paid.toLocaleString()}</td>
                      <td className="text-warning">GH¢ {r.tax.toLocaleString()}</td>
                      <td className="text-destructive font-bold">GH¢ {r.outstanding.toLocaleString()}</td>
                      <td>{r.netClaim > 0 ? `${(((r.paid + r.tax) / r.netClaim) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                  {sortedReport.filter(r => r.outstanding > 0).length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">{settlementReportUnavailable ? "Settlement data is unavailable; this is not a zero receivable balance." : "No outstanding receivables"}</td></tr>}
                </tbody>
                {sortedReport.filter(r => r.outstanding > 0).length > 0 && (
                  <tfoot><tr className="font-bold bg-muted/30"><td>Total</td><td>GH¢ {grandNet.toLocaleString()}</td><td className="text-success">GH¢ {grandPaid.toLocaleString()}</td><td className="text-warning">GH¢ {grandTax.toLocaleString()}</td><td className="text-destructive">GH¢ {grandOutstanding.toLocaleString()}</td><td>{grandNet > 0 ? `${(((grandPaid + grandTax) / grandNet) * 100).toFixed(1)}%` : "—"}</td></tr></tfoot>
                )}
              </table>
            </div>
          </TabsContent>

          <TabsContent value="tax">
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-4">{periodLabel} — Tax Liability Report</h3>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-warning">GH¢ {taxLiabilityData.whtPayable.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT Payable</p></div>
                <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-success">GH¢ {taxLiabilityData.whtReversals.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT Reversals</p></div>
                <div className="stat-card text-center"><p className="text-2xl font-bold font-heading">GH¢ {taxLiabilityData.netLiability.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Net Tax Liability</p></div>
                <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-primary">GH¢ {taxLiabilityData.taxCreditReceivable.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">WHT Tax Credit Receivable</p></div>
              </div>
              <table className="data-table">
                <thead><tr><th>Company</th><th>WHT Basis</th><th>Tax Base (GHS)</th><th>WHT Rate</th><th>Provisional WHT (GHS)</th><th>Actual WHT (GHS)</th><th>WHT Applied (GHS)</th></tr></thead>
                <tbody>
                  {settlementReportUnavailable && <tr><td colSpan={7} className="text-center text-muted-foreground py-6">Company-level WHT reconciliation is unavailable because the claims settlement source is missing.</td></tr>}
                  {sortedReport.filter(r => r.tax > 0).map((r) => (
                    <tr key={r.company} className="hover:bg-muted/50 transition-colors">
                      <td className="font-medium"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#3b82f6" }} />{r.company}</div></td>
                      <td>{r.taxBasisLabel}</td>
                      <td>{r.taxBasisAmount == null ? "—" : `GH¢ ${r.taxBasisAmount.toLocaleString()}`}</td>
                      <td>{r.taxRate == null ? "—" : `${(r.taxRate * 100).toFixed(2)}%`}</td>
                      <td>GH¢ {r.provisionalTax.toLocaleString()}</td>
                      <td>GH¢ {r.actualTax.toLocaleString()}</td>
                      <td className="font-semibold text-warning">GH¢ {r.tax.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!settlementReportUnavailable && sortedReport.filter(r => r.tax > 0).length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-6">No withholding tax data for the selected period.</td></tr>}
                </tbody>
                {sortedReport.filter(r => r.tax > 0).length > 0 && (
                  <tfoot><tr className="font-bold bg-muted/30"><td>Total</td><td>—</td><td>—</td><td>—</td><td>GH¢ {sortedReport.reduce((sum, row) => sum + row.provisionalTax, 0).toLocaleString()}</td><td>GH¢ {sortedReport.reduce((sum, row) => sum + row.actualTax, 0).toLocaleString()}</td><td className="text-warning">GH¢ {grandTax.toLocaleString()}</td></tr></tfoot>
                )}
              </table>
            </div>
          </TabsContent>

          <TabsContent value="operations">
            <div className="stat-card space-y-4">
              <h3 className="font-heading font-semibold">{periodLabel} — Operational Performance</h3>
              <OperationalPerformanceReport
                claims={operationalClaims}
                insurers={operationalInsurers}
                payments={payments || []}
                settlementPeriods={operationalSettlementPeriods}
                outstandingPeriods={operationalOutstandingPeriods}
                auditLogs={operationalAuditLogs}
                profiles={profiles || []}
                canReadAudit={canReadAudit}
                canReadClaims={canReadClaims}
                settlementSourceUnavailable={Boolean(settlementPeriodsError)}
                outstandingSourceUnavailable={Boolean(outstandingPeriodsError)}
                auditSourceUnavailable={Boolean(auditLogsError)}
              />
            </div>
          </TabsContent>

          <TabsContent value="settlement">
            <div className="stat-card space-y-4">
              <h3 className="font-heading font-semibold">{periodLabel} — Claims-Cycle Settlement Reconciliation</h3>
              {settlementCycleReportUnavailable
                ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">The settlement-period database source is unavailable. No reconciliation totals are being represented as zero.</div>
                : <SettlementReconciliationReport periods={settlementCycleSourceRows} insurers={insurers || []} />}
            </div>
          </TabsContent>

          <TabsContent value="receipts">
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-2">{periodLabel} — Cash Receipts by Payment Month</h3>
              <p className="text-sm text-muted-foreground mb-4">Cash is grouped by the recorded payment date and insurer. This report does not infer claims-cycle settlement or actual WHT receipt dates.</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="stat-card text-center"><p className="text-2xl font-bold font-heading text-success">GH¢ {receiptMonthData.reduce((sum, entry) => sum + entry.net_cash_received, 0).toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Cash Received</p></div>
                <div className="stat-card text-center"><p className="text-2xl font-bold font-heading">{receiptMonthData.reduce((sum, entry) => sum + entry.payment_count, 0).toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Payment Entries</p></div>
              </div>
              <table className="data-table">
                <thead><tr><th>Insurance Company</th><th>Payment Month</th><th>Cash Received (GHS)</th><th>Payment Entries</th></tr></thead>
                <tbody>
                  {receiptMonthData.map((entry) => (
                    <tr key={`${entry.insurance_company_id}:${entry.receipt_month}`}>
                      <td className="font-medium">{(insurers || []).find((ins) => ins.id === entry.insurance_company_id)?.company_name || "Unknown insurer"}</td>
                      <td>{monthNames[entry.receipt_month_number]} {entry.receipt_year}</td>
                      <td className="text-success font-semibold">GH¢ {entry.net_cash_received.toLocaleString()}</td>
                      <td>{entry.payment_count}</td>
                    </tr>
                  ))}
                  {receiptMonthData.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-8">No payment records for the selected period.</td></tr>}
                </tbody>
                {receiptMonthData.length > 0 && <tfoot><tr className="font-bold bg-muted/30"><td>Grand Total</td><td>—</td><td>GH¢ {receiptMonthData.reduce((sum, entry) => sum + entry.net_cash_received, 0).toLocaleString()}</td><td>{receiptMonthData.reduce((sum, entry) => sum + entry.payment_count, 0)}</td></tr></tfoot>}
              </table>
            </div>
          </TabsContent>

          <TabsContent value="aging">
            <div className="stat-card">
              <h3 className="font-heading font-semibold mb-4">Claim Aging Report — Outstanding by Bucket</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="stat-card text-center"><p className="text-xl font-bold font-heading text-success">{settlementReportUnavailable ? "—" : `GH¢ ${agingData.b30.toLocaleString()}`}</p><p className="text-xs text-muted-foreground mt-1">0 – 30 days</p></div>
                <div className="stat-card text-center"><p className="text-xl font-bold font-heading text-info">{settlementReportUnavailable ? "—" : `GH¢ ${agingData.b60.toLocaleString()}`}</p><p className="text-xs text-muted-foreground mt-1">31 – 60 days</p></div>
                <div className="stat-card text-center"><p className="text-xl font-bold font-heading text-warning">{settlementReportUnavailable ? "—" : `GH¢ ${agingData.b90.toLocaleString()}`}</p><p className="text-xs text-muted-foreground mt-1">61 – 90 days</p></div>
                <div className="stat-card text-center"><p className="text-xl font-bold font-heading text-warning">{settlementReportUnavailable ? "—" : `GH¢ ${agingData.b120.toLocaleString()}`}</p><p className="text-xs text-muted-foreground mt-1">91 – 120 days</p></div>
                <div className="stat-card text-center"><p className="text-xl font-bold font-heading text-destructive">{settlementReportUnavailable ? "—" : `GH¢ ${agingData.b120plus.toLocaleString()}`}</p><p className="text-xs text-muted-foreground mt-1">120+ days (high risk)</p></div>
              </div>
              <p className="text-sm text-muted-foreground">Buckets are computed from the end of each claim's submission month to today. Aging shows where receivable exposure is concentrated and which insurers need escalation.</p>
            </div>
          </TabsContent>
        </div>
        )}
      </Tabs>
      <HtmlPrintPreviewDialog open={printPreviewOpen} onOpenChange={setPrintPreviewOpen} html={printPreviewHtml} title="Report print preview" />
      <PdfPreviewDialog open={pdfPreviewOpen} onOpenChange={setPdfPreviewOpen} blob={pdfPreviewBlob} fileName={pdfPreviewName} title="Report PDF preview" />
    </div>
  );
}
