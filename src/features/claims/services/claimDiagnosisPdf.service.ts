import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";

type PdfRow = Record<string, unknown>;

export interface ClaimDiagnosisPdfData {
  id?: string;
  workflow_type?: unknown;
  patient_name?: unknown;
  claim_number?: unknown;
  date_of_service?: unknown;
  insurance_company_id?: unknown;
  insurer_name?: unknown;
  rejection_reason?: unknown;
  clinical_notes?: unknown;
  authorization_code?: unknown;
  co_payment?: unknown;
  comments?: unknown;
  diagnoses?: unknown;
  service_items?: unknown;
  response_message?: unknown;
  total_amount?: unknown;
  updated_at?: unknown;
}

const value = (input: unknown) => input === null || input === undefined || input === "" ? "—" : String(input);
const objectRows = (input: unknown): PdfRow[] => Array.isArray(input)
  ? input.filter((row): row is PdfRow => Boolean(row) && typeof row === "object" && !Array.isArray(row))
  : [];
const strings = (input: unknown): string[] => Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];

function safeFilename(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "claim";
}

export function exportClaimDiagnosisDraftPdf(draft: ClaimDiagnosisPdfData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const workflow = draft.workflow_type === "rejected_claim" ? "Rejected claim response" : "Claim update";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CLAIM REVIEW DRAFT", margin, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${workflow} · Generated ${new Date().toLocaleString()}`, margin, 25);

  autoTable(doc, {
    startY: 31,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, overflow: "linebreak" },
    head: [["Claim details", "Value", "Claim details", "Value"]],
    body: [
      ["Patient", value(draft.patient_name), "Claim reference", value(draft.claim_number)],
      ["Date of service", value(draft.date_of_service), "Insurer", value(draft.insurer_name ?? (draft.insurance_company_id ? "Selected (name unavailable)" : null))],
      ["Workflow", workflow, "Authorization", value(draft.authorization_code)],
      ["Rejection reason", value(draft.rejection_reason), "Co-payment", value(draft.co_payment)],
    ],
  });

  const diagnoses = objectRows(draft.diagnoses);
  let y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 55;
  y += 6;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, overflow: "linebreak" },
    head: [["Selected diagnosis", "Description", "Source"]],
    body: diagnoses.length
      ? diagnoses.map((item) => [value(item.code), value(item.description), value(item.source)])
      : [["—", "No diagnoses selected", "—"]],
  });

  const serviceItems = objectRows(draft.service_items);
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    head: [["Code", "Service", "Qty", "Unit price (GH¢)", "Amount (GH¢)"]],
    body: serviceItems.length
      ? serviceItems.map((item) => {
          const quantity = Number(item.quantity) || 0;
          const unitPrice = Number(item.unitPrice) || 0;
          return [value(item.code), value(item.description), value(item.quantity), unitPrice.toFixed(2), (quantity * unitPrice).toFixed(2)];
        })
      : [["—", "No service items", "—", "—", "—"]],
    foot: [["", "", "", "Total", `GH¢ ${Number(draft.total_amount || 0).toFixed(2)}`]],
  });

  const response = typeof draft.response_message === "string" ? draft.response_message.trim() : "";
  const notes = typeof draft.clinical_notes === "string" ? draft.clinical_notes.trim() : "";
  const comments = strings(draft.comments);
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;

  const addTextSection = (title: string, text: string) => {
    if (!text) return;
    if (y > 255) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(text, 180);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 5;
  };

  addTextSection("Clinical notes", notes);
  addTextSection("Claim response", response);
  addTextSection("Comments", comments.join("\n"));

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Review draft only — not submitted to a payer. Verify all clinical and billing details before use.", margin, 287);
  }

  const reference = safeFilename(String(draft.claim_number || draft.id || "claim"));
  doc.save(`claim-review-${reference}.pdf`);
}
