import type { OfflineEntity, OfflineRecord } from "./offline-store";

export const EXCEL_SHEETS: readonly OfflineEntity[] = [
  "preauthorizations",
  "preauth_items",
  "patients",
  "insurance_companies",
  "doctors",
  "procedures",
  "diagnosis_codes",
  "preauth_catalog_items",
  "system_settings",
  "preauth_insurer_tariffs",
  "preauthorization_versions",
  "preauthorization_submissions",
  "preauthorization_audit_events",
  "claims_settlement_periods",
  "settlement_exceptions",
  "settlement_exception_audit_events",
];

export type ExcelColumn = {
  key: string;
  heading: string;
  description: string;
  required: boolean;
  entry: "user" | "system";
  example?: string;
};

const commonId: ExcelColumn = {
  key: "id", heading: "Record ID", description: "Unique CareFlow record identifier. Do not duplicate values.", required: true, entry: "user", example: "REC-001",
};

const SCHEMA: Partial<Record<OfflineEntity, readonly ExcelColumn[]>> = {
  preauthorizations: [commonId,
    { key: "facility_id", heading: "Facility ID", description: "Facility owning this pre-authorization.", required: true, entry: "user", example: "FAC-001" },
    { key: "client_name", heading: "Client / Patient Name", description: "Name of the patient/client for the request.", required: true, entry: "user", example: "Ama Mensah" },
    { key: "insurer_name", heading: "Insurance Company", description: "Insurer/payer name.", required: true, entry: "user", example: "Example Health Insurance" },
    { key: "membership_number", heading: "Membership Number", description: "Insurance membership/policy identifier.", required: false, entry: "user", example: "MEM-001" },
    { key: "request_date", heading: "Request Date", description: "Date the authorization request was created.", required: false, entry: "user", example: "2026-09-08" },
    { key: "total_cost", heading: "Total Cost", description: "Total requested amount; must agree with charge lines.", required: false, entry: "user", example: "1250.00" },
  ],
  preauth_items: [commonId,
    { key: "preauthorization_id", heading: "Pre-Authorization ID", description: "Record ID of the parent pre-authorization.", required: true, entry: "user", example: "PA-001" },
    { key: "description", heading: "Service / Charge Description", description: "Description of the requested service or charge.", required: true, entry: "user", example: "Consultation" },
    { key: "quantity", heading: "Quantity", description: "Number of units requested.", required: true, entry: "user", example: "1" },
    { key: "unit_price", heading: "Unit Price", description: "Price for one unit.", required: true, entry: "user", example: "250.00" },
    { key: "amount", heading: "Amount", description: "Extended line amount. Prefer allowing CareFlow to calculate this.", required: false, entry: "system", example: "250.00" },
  ],
  patients: [commonId,
    { key: "facility_id", heading: "Facility ID", description: "Facility owning the patient record.", required: true, entry: "user", example: "FAC-001" },
    { key: "name", heading: "Patient Name", description: "Patient's full name.", required: true, entry: "user", example: "Ama Mensah" },
    { key: "date_of_birth", heading: "Date of Birth", description: "Patient date of birth in ISO date format where known.", required: false, entry: "user", example: "1990-01-15" },
    { key: "membership_number", heading: "Membership Number", description: "Insurance membership number where applicable.", required: false, entry: "user", example: "MEM-001" },
  ],
  insurance_companies: [commonId,
    { key: "name", heading: "Insurance Company Name", description: "Registered insurer/payer name.", required: true, entry: "user", example: "Example Health Insurance" },
  ],
  doctors: [commonId, { key: "name", heading: "Doctor Name", description: "Registered doctor/provider name.", required: true, entry: "user", example: "Dr. K. Mensah" }],
  procedures: [commonId, { key: "name", heading: "Procedure Name", description: "Procedure/service name used by the catalogue.", required: true, entry: "user", example: "Ultrasound" }],
  diagnosis_codes: [commonId,
    { key: "code", heading: "Diagnosis Code", description: "Controlled diagnosis code.", required: true, entry: "user", example: "Z00.00" },
    { key: "description", heading: "Diagnosis Description", description: "Human-readable diagnosis description.", required: true, entry: "user", example: "General examination" },
  ],
  preauth_catalog_items: [commonId,
    { key: "description", heading: "Catalog Item", description: "Reusable pre-authorization service/catalog description.", required: true, entry: "user", example: "Consultation" },
    { key: "unit_price", heading: "Default Unit Price", description: "Default charge when applicable.", required: false, entry: "user", example: "250.00" },
  ],
  system_settings: [commonId,
    { key: "setting_key", heading: "Setting Key", description: "System setting identifier.", required: true, entry: "user", example: "currency" },
    { key: "setting_value", heading: "Setting Value", description: "Configured setting value.", required: true, entry: "user", example: "GHS" },
  ],
  preauth_insurer_tariffs: [commonId,
    { key: "insurance_company_id", heading: "Insurance Company ID", description: "Registered insurer record ID.", required: true, entry: "user", example: "INS-001" },
    { key: "procedure_id", heading: "Procedure ID", description: "Registered procedure/catalogue record ID.", required: true, entry: "user", example: "PROC-001" },
    { key: "tariff", heading: "Insurer Tariff", description: "Contracted tariff amount.", required: true, entry: "user", example: "200.00" },
    { key: "effective_from", heading: "Effective From", description: "Date the tariff becomes effective.", required: true, entry: "user", example: "2026-01-01" },
  ],
  claims_settlement_periods: [commonId,
    { key: "facility_id", heading: "Facility ID", description: "Facility owning the settlement period.", required: true, entry: "user", example: "FAC-001" },
    { key: "insurance_company_id", heading: "Insurance Company ID", description: "Insurer record ID.", required: true, entry: "user", example: "INS-001" },
    { key: "period_start", heading: "Period Start", description: "First date covered by the settlement period.", required: true, entry: "user", example: "2026-08-01" },
    { key: "period_end", heading: "Period End", description: "Last date covered by the settlement period.", required: true, entry: "user", example: "2026-08-31" },
    { key: "period_type", heading: "Period Type", description: "Settlement period type: month, quarter, or custom.", required: true, entry: "user", example: "month" },
    { key: "total_claims_submitted", heading: "Total Claims Submitted", description: "Total amount submitted for the period.", required: true, entry: "user", example: "125000.00" },
    { key: "withholding_tax_rate", heading: "WHT Rate", description: "Applicable withholding tax rate as a decimal.", required: true, entry: "user", example: "0.05" },
    { key: "provisional_withholding_tax", heading: "Provisional WHT", description: "System-calculated provisional WHT; do not use as confirmed actual WHT.", required: false, entry: "system", example: "6250.00" },
    { key: "payment_received", heading: "Payment Received", description: "Confirmed payment received from payment advice.", required: false, entry: "user", example: "118000.00" },
    { key: "rejection_amount", heading: "Rejection Amount", description: "Confirmed rejection amount from the settlement source.", required: false, entry: "user", example: "1000.00" },
    { key: "actual_withholding_tax", heading: "Actual WHT", description: "Confirmed actual WHT from payment advice. Never infer this value.", required: false, entry: "user", example: "6250.00" },
    { key: "payment_advice_reference", heading: "Payment Advice Reference", description: "Reference appearing on the payment advice.", required: false, entry: "user", example: "ADV-001" },
    { key: "payment_advice_date", heading: "Payment Advice Date", description: "Date on the payment advice.", required: false, entry: "user", example: "2026-09-05" },
    { key: "settlement_status", heading: "Settlement Status", description: "awaiting_payment, payment_advice_received, or reconciled.", required: true, entry: "user", example: "awaiting_payment" },
    { key: "withholding_tax_variance", heading: "WHT Variance", description: "Difference between provisional and confirmed actual WHT; do not invent this value.", required: false, entry: "system", example: "0.00" },
  ],
};

export function getExcelColumns(entity: OfflineEntity): readonly ExcelColumn[] {
  return SCHEMA[entity] ?? [commonId];
}

export function getExcelSheetTitle(entity: OfflineEntity): string {
  return entity.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export type ExcelRow = OfflineRecord & { entity: OfflineEntity; createdAt?: string; updatedAt?: string };

export function serializeExcelValue(value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

export function deserializeExcelValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

export function normalizeExcelRows(entity: OfflineEntity, rows: Record<string, unknown>[]): ExcelRow[] {
  return rows.map((row, index) => {
    const id = String(row.id || `${entity}-${index + 1}`);
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, deserializeExcelValue(value)])) as ExcelRow;
  }).map((row) => ({ ...row, id: String(row.id), entity }));
}
