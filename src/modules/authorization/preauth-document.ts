import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { frozenSnapshotItems, type PreAuthFrozenSnapshot } from "./preauth-integrity";
import { formatProcedureDate, itemAmount, totalItems, type PreAuthDocumentFormat, type PreAuthStudioItem } from "./preauth-studio";

export interface PreAuthPdfData {
  requestNumber?: string;
  issuedDate?: string;
  patientName: string;
  membershipNumber: string;
  patientPhone?: string;
  companyName?: string;
  providerName: string;
  providerAddress?: string;
  providerPhone?: string;
  doctorName?: string;
  procedureName: string;
  procedureDate: string;
  diagnosis?: string;
  currency?: string;
  format?: PreAuthDocumentFormat;
  logoUrl?: string;
}

const money = (value: number, currency: string) => `${currency} ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function rgb(hex = "#1E4078"): [number, number, number] { const match = /^#?([0-9a-f]{6})$/i.exec(hex); if (!match) return [30, 64, 120]; const n = Number.parseInt(match[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
async function imageData(url?: string) { if (!url) return null; try { const response = await fetch(url, { mode: "cors" }); if (!response.ok) return null; const blob = await response.blob(); const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); }); return { data, format: blob.type.includes("png") ? "PNG" : "JPEG" }; } catch { return null; } }
function drawGhanaHeader(doc: jsPDF, data: PreAuthPdfData, yStart: number) { const width = doc.internal.pageSize.getWidth(); const accent = rgb(); doc.setDrawColor(...accent); doc.setLineWidth(1); doc.line(16, yStart, width - 16, yStart); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(0); doc.text((data.providerName || "MEDICAL FACILITY").toUpperCase(), width / 2, yStart + 10, { align: "center" }); doc.setFontSize(9); if (data.providerAddress) doc.text(data.providerAddress, width / 2, yStart + 16, { align: "center" }); if (data.providerPhone) doc.text(`Tel: ${data.providerPhone}`, width / 2, yStart + 22, { align: "center" }); doc.setFontSize(12); doc.text("PRE-AUTHORIZATION REQUEST", width / 2, yStart + 32, { align: "center" }); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(data.requestNumber ? `Request No: ${data.requestNumber}` : "", 16, yStart + 39); doc.text(`Date: ${data.issuedDate || ""}`, width - 16, yStart + 39, { align: "right" }); return yStart + 45; }
function drawField(doc: jsPDF, label: string, value: string, x: number, y: number, width: number) { doc.setDrawColor(100); doc.setLineWidth(0.2); doc.rect(x, y, width, 8); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.text(label, x + 2, y + 3); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(doc.splitTextToSize(value || "—", width - 34)[0], x + 31, y + 5); }
function addPatientBlock(doc: jsPDF, data: PreAuthPdfData, y: number) { const width = doc.internal.pageSize.getWidth() - 32; const half = (width - 4) / 2; drawField(doc, "NAME:", data.patientName, 16, y, half); drawField(doc, "COMPANY:", data.companyName || "—", 20 + half, y, half); drawField(doc, "MEMBERSHIP #:", data.membershipNumber, 16, y + 9, half); drawField(doc, "PATIENT TEL:", data.patientPhone || "—", 20 + half, y + 9, half); drawField(doc, "PROVIDER:", data.providerName, 16, y + 18, half); drawField(doc, "DOCTOR:", data.doctorName || "—", 20 + half, y + 18, half); drawField(doc, "PROCEDURE:", data.procedureName, 16, y + 27, half); drawField(doc, "DATE:", formatProcedureDate(data.procedureDate), 20 + half, y + 27, half); drawField(doc, "DIAGNOSIS:", data.diagnosis || "—", 16, y + 36, width); return y + 47; }
function sectionRows(items: PreAuthStudioItem[], category: PreAuthStudioItem["category"], currency: string) { return items.filter((item) => item.category === category).map((item) => [item.description, String(item.quantity), money(item.unitPrice, currency), money(itemAmount(item), currency)]); }

export function preAuthPdfDataFromSnapshot(snapshot: PreAuthFrozenSnapshot): PreAuthPdfData {
  return { requestNumber: snapshot.requestNumber || undefined, issuedDate: snapshot.issuedDate || undefined, patientName: snapshot.patient.name, membershipNumber: snapshot.patient.membershipNumber, patientPhone: snapshot.patient.phone || undefined, companyName: snapshot.patient.companyName || snapshot.insurer.name || undefined, providerName: snapshot.provider.name || "MEDICAL FACILITY", providerAddress: snapshot.provider.address || undefined, providerPhone: snapshot.provider.phone || undefined, doctorName: snapshot.clinical.doctorName || undefined, procedureName: snapshot.clinical.procedureName, procedureDate: snapshot.clinical.procedureDate, diagnosis: snapshot.clinical.diagnosis || undefined, currency: snapshot.document.currency, format: snapshot.document.format, logoUrl: snapshot.provider.logoUrl || undefined };
}

export async function buildPreAuthPdf(data: PreAuthPdfData, items: PreAuthStudioItem[]) {
  const format = data.format || "ghana"; const currency = data.currency || (format === "ghana" ? "GH¢" : "USD"); const doc = new jsPDF({ unit: "mm", format: "a4" }); const width = doc.internal.pageSize.getWidth(); const height = doc.internal.pageSize.getHeight(); const accent = rgb(); const logo = await imageData(data.logoUrl);
  if (logo) { try { doc.addImage(logo.data, logo.format as any, 16, 12, 18, 18); } catch { /* optional logo */ } }
  let y = format === "ghana" ? drawGhanaHeader(doc, data, 12) : 28;
  if (format === "international") { doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("PRE-AUTHORIZATION REQUEST", 16, 18); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(`Request number: ${data.requestNumber || "—"}`, 16, 23); doc.text(`Issue date: ${data.issuedDate || ""}`, width - 16, 23, { align: "right" }); doc.setDrawColor(...accent); doc.line(16, 26, width - 16, 26); }
  y = addPatientBlock(doc, data, y);
  const categories: Array<[PreAuthStudioItem["category"], string]> = [["procedure", "Procedure / Consultation / Accommodation / Other"], ["laboratory", "Laboratory examinations"], ["drugs", "Drugs"], ["accommodation", "Accommodation"], ["other", "Other services"]];
  let tableY = y + 2;
  for (const [category, title] of categories) { const rows = sectionRows(items, category, currency); if (!rows.length) continue; autoTable(doc, { startY: tableY, margin: { left: 16, right: 16 }, head: [[{ content: title, colSpan: 4, styles: { halign: "left" } }], ["Description", "Quantity", `Unit (${currency})`, `Amount (${currency})`]], body: rows, theme: "grid", styles: { font: "helvetica", fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: accent, textColor: 255, fontStyle: "bold" }, columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 22, halign: "center" }, 2: { cellWidth: 30, halign: "right" }, 3: { cellWidth: 32, halign: "right" } } }); tableY = (doc as any).lastAutoTable.finalY + 3; }
  const total = totalItems(items); autoTable(doc, { startY: tableY, margin: { left: 16, right: 16 }, body: [["", "", "TOTAL", money(total, currency)]], theme: "grid", styles: { font: "helvetica", fontSize: 9, fontStyle: "bold" }, columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 22 }, 2: { cellWidth: 30, halign: "right" }, 3: { cellWidth: 32, halign: "right" } } });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100); doc.text(format === "international" ? "This provider-generated request is submitted for insurer review. Coverage and authorization remain subject to the member's policy and the insurer's requirements." : "Charges are submitted for insurer review and are subject to the member's benefit terms and applicable tariff.", 16, height - 10);
  return doc;
}

export async function buildPreAuthPdfFromSnapshot(snapshot: PreAuthFrozenSnapshot) { return buildPreAuthPdf(preAuthPdfDataFromSnapshot(snapshot), frozenSnapshotItems(snapshot)); }
export async function downloadPreAuthPdf(data: PreAuthPdfData, items: PreAuthStudioItem[]) { const doc = await buildPreAuthPdf(data, items); const safe = (data.patientName || "request").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); doc.save(`${data.requestNumber || "preauth"}-${safe}.pdf`); }
export async function downloadPreAuthPdfFromSnapshot(snapshot: PreAuthFrozenSnapshot) { const data = preAuthPdfDataFromSnapshot(snapshot); const doc = await buildPreAuthPdfFromSnapshot(snapshot); const safe = (data.patientName || "request").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); doc.save(`${data.requestNumber || "preauth"}-${safe}.pdf`); }
export async function preAuthPdfDataUri(data: PreAuthPdfData, items: PreAuthStudioItem[]) { const doc = await buildPreAuthPdf(data, items); return doc.output("datauristring"); }
export async function preAuthPdfDataUriFromSnapshot(snapshot: PreAuthFrozenSnapshot) { const doc = await buildPreAuthPdfFromSnapshot(snapshot); return doc.output("datauristring"); }
