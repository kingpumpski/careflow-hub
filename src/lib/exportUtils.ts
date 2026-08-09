import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface GrandTotals {
  grandTotalSubmitted: number;
  grandTotalPaid: number;
  grandTotalTax: number;
  grandOutstanding: number;
  grandRejected: number;
}

export function exportClaimsPDF(data: any[], totals: GrandTotals) {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Claims Management Report", 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);

  autoTable(doc, {
    startY: 38,
    head: [["Insurance Company", "Claims", "Submitted (GH¢)", "Paid (GH¢)", "WHT (GH¢)", "Outstanding (GH¢)", "Rejected (GH¢)", "Status"]],
    body: data.map((a: any) => [
      a.company_name,
      a.claimCount,
      a.totalSubmitted.toLocaleString(),
      a.totalPaid.toLocaleString(),
      a.totalTax.toLocaleString(),
      a.outstanding.toLocaleString(),
      a.totalRejected.toLocaleString(),
      a.paymentStatus,
    ]),
    foot: [["Grand Total", data.reduce((s, a) => s + a.claimCount, 0).toString(), totals.grandTotalSubmitted.toLocaleString(), totals.grandTotalPaid.toLocaleString(), totals.grandTotalTax.toLocaleString(), totals.grandOutstanding.toLocaleString(), totals.grandRejected.toLocaleString(), ""]],
    theme: "grid",
    headStyles: { fillColor: [30, 64, 120] },
    footStyles: { fillColor: [220, 240, 220], textColor: [0, 0, 0], fontStyle: "bold" },
  });

  doc.save("claims-report.pdf");
}

export function exportClaimsExcel(data: any[], totals: GrandTotals) {
  const rows = data.map((a: any) => ({
    "Insurance Company": a.company_name,
    "Claims": a.claimCount,
    "Submitted (GH¢)": a.totalSubmitted,
    "Paid (GH¢)": a.totalPaid,
    "WHT (GH¢)": a.totalTax,
    "Outstanding (GH¢)": a.outstanding,
    "Rejected (GH¢)": a.totalRejected,
    "Status": a.paymentStatus,
  }));
  rows.push({
    "Insurance Company": "Grand Total",
    "Claims": data.reduce((s, a) => s + a.claimCount, 0),
    "Submitted (GH¢)": totals.grandTotalSubmitted,
    "Paid (GH¢)": totals.grandTotalPaid,
    "WHT (GH¢)": totals.grandTotalTax,
    "Outstanding (GH¢)": totals.grandOutstanding,
    "Rejected (GH¢)": totals.grandRejected,
    "Status": "",
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Claims");
  XLSX.writeFile(wb, "claims-report.xlsx");
}

export interface BankingPartner {
  bank_name: string;
  account_name?: string;
  account_number?: string;
  branch?: string;
  swift?: string;
}

export interface LetterheadConfig {
  provider_name?: string;
  provider_address?: string;
  provider_phone?: string;
  provider_email?: string;
  logo_url?: string;
  accent_color?: string;      // hex, e.g. #1E4078
  header_style?: "bar" | "rule" | "minimal";
  show_banking?: boolean;
  banking_partners?: BankingPartner[];
  footer_note?: string;
}

function hexToRgb(hex?: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return [30, 64, 120];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Loads an image URL into a data URI usable by jsPDF. Returns null on failure. */
export async function loadImageDataUrl(url?: string): Promise<{ data: string; format: string } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const format = blob.type.includes("png") ? "PNG" : blob.type.includes("webp") ? "WEBP" : "JPEG";
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { data, format };
  } catch {
    return null;
  }
}

export async function exportPreAuthPDF(preauth: any, items: any[], companyInfo: LetterheadConfig) {
  const doc = await buildPreAuthDoc(preauth, items, companyInfo);
  doc.save(`preauth-${preauth.id?.slice(0, 8) || "request"}.pdf`);
}

export async function preAuthPdfBase64(preauth: any, items: any[], companyInfo: LetterheadConfig): Promise<{ base64: string; filename: string }> {
  const doc = await buildPreAuthDoc(preauth, items, companyInfo);
  const dataUri = doc.output("datauristring");
  const base64 = dataUri.split(",")[1] || "";
  return { base64, filename: `preauth-${preauth.id?.slice(0, 8) || "request"}.pdf` };
}

/** Draws the branded letterhead (logo, provider identity, accent styling) and returns the next Y. */
export async function drawLetterhead(doc: jsPDF, cfg: LetterheadConfig, title: string): Promise<number> {
  const accent = hexToRgb(cfg.accent_color);
  const pageW = doc.internal.pageSize.getWidth();
  const style = cfg.header_style || "bar";

  if (style === "bar") {
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(0, 0, pageW, 4, "F");
  }

  const logo = await loadImageDataUrl(cfg.logo_url);
  let textX = 14;
  if (logo) {
    try {
      doc.addImage(logo.data, logo.format as any, 14, 10, 22, 22);
      textX = 41;
    } catch { /* unsupported image, fall back to text-only */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(cfg.provider_name || "Medical Facility", textX, 19);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  let ly = 25;
  if (cfg.provider_address) { doc.text(cfg.provider_address, textX, ly); ly += 5; }
  const contact = [cfg.provider_phone ? `Tel: ${cfg.provider_phone}` : "", cfg.provider_email || ""].filter(Boolean).join("   •   ");
  if (contact) { doc.text(contact, textX, ly); ly += 5; }

  const ruleY = Math.max(ly + 1, 34);
  if (style !== "minimal") {
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(0.8);
    doc.line(14, ruleY, pageW - 14, ruleY);
    doc.setLineWidth(0.2);
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.line(14, ruleY + 1.6, pageW - 14, ruleY + 1.6);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0);
  doc.text(title.toUpperCase(), 14, ruleY + 12);
  doc.setFont("helvetica", "normal");

  return ruleY + 20;
}

/** Draws the banking-partner footer band: filled chips for primary banks, outlined for the rest. */
export function drawBankingFooter(doc: jsPDF, cfg: LetterheadConfig) {
  const partners = (cfg.banking_partners || []).filter((b) => b?.bank_name);
  if (cfg.show_banking === false || partners.length === 0) return;

  const accent = hexToRgb(cfg.accent_color);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const rows = Math.ceil(partners.length / 2);
  const bandH = 16 + rows * 12;
  const top = pageH - bandH - 8;

  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.5);
  doc.line(14, top, pageW - 14, top);

  doc.setFontSize(8);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.setFont("helvetica", "bold");
  doc.text("BANKING PARTNERS", 14, top + 6);
  doc.setFont("helvetica", "normal");

  const colW = (pageW - 28) / 2;
  partners.forEach((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 14 + col * colW;
    const y = top + 11 + row * 12;

    // Icon: filled marker for the first two (primary), outlined for the rest.
    if (i < 2) {
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.circle(x + 2, y + 1.2, 2, "F");
    } else {
      doc.setDrawColor(accent[0], accent[1], accent[2]);
      doc.setLineWidth(0.5);
      doc.circle(x + 2, y + 1.2, 2, "S");
    }

    doc.setFontSize(8.5);
    doc.setTextColor(40);
    doc.setFont("helvetica", "bold");
    doc.text(b.bank_name, x + 6, y + 1);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    const line2 = [b.account_name, b.account_number ? `A/C ${b.account_number}` : "", b.branch, b.swift ? `SWIFT ${b.swift}` : ""]
      .filter(Boolean).join(" • ");
    if (line2) doc.text(doc.splitTextToSize(line2, colW - 8)[0], x + 6, y + 5.5);
  });

  if (cfg.footer_note) {
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(doc.splitTextToSize(cfg.footer_note, pageW - 28)[0], 14, pageH - 6);
  }
}

async function buildPreAuthDoc(preauth: any, items: any[], companyInfo: LetterheadConfig): Promise<jsPDF> {
  const doc = new jsPDF();
  let y = await drawLetterhead(doc, companyInfo || {}, "Pre-Authorization Request");

  doc.setFontSize(10);
  const addLine = (label: string, value: string) => {
    doc.setTextColor(100);
    doc.text(label, 14, y);
    doc.setTextColor(0);
    doc.text(value, 70, y);
    y += 7;
  };
  addLine("Patient:", preauth.patient_name || "—");
  addLine("Insurance:", preauth.insurance_name || "—");
  addLine("Doctor:", preauth.doctor_name || "—");
  addLine("Diagnosis:", preauth.diagnosis || "—");
  addLine("Date:", preauth.procedure_date || "—");
  addLine("Status:", preauth.status || "pending");

  autoTable(doc, {
    startY: y + 5,
    head: [["#", "Description", "Qty", "Unit Price (GH¢)", "Amount (GH¢)"]],
    body: items.map((item: any, i: number) => [
      i + 1,
      item.description,
      item.quantity,
      Number(item.unit_price).toLocaleString(),
      Number(item.amount).toLocaleString(),
    ]),
    foot: [["", "Total", "", "", `GH¢ ${Number(preauth.total_cost || 0).toLocaleString()}`]],
    theme: "grid",
    headStyles: { fillColor: hexToRgb(companyInfo?.accent_color) },
    footStyles: { fillColor: [220, 240, 220], textColor: [0, 0, 0], fontStyle: "bold" },
  });

  drawBankingFooter(doc, companyInfo || {});
  return doc;
}

export async function exportReportPDF(title: string, data: any[], columns: string[], companyInfo: LetterheadConfig) {
  const doc = new jsPDF("landscape");
  const y = await drawLetterhead(doc, companyInfo || {}, title);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, y);

  autoTable(doc, {
    startY: y + 6,
    head: [columns],
    body: data,
    theme: "grid",
    headStyles: { fillColor: hexToRgb(companyInfo?.accent_color) },
  });

  drawBankingFooter(doc, companyInfo || {});
  doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

export function exportReportExcel(title: string, rows: any[], sheetName: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${title.toLowerCase().replace(/\s+/g, "-")}.xlsx`);
}
