import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawLetterhead, type LetterheadConfig } from "@/lib/exportUtils";
import type { StatementSummary } from "./statementOfAccount";

export type StatementCompany = {
  company_name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
};

const money = (value: number) => `GH¢ ${Math.abs(value).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export async function exportCompanyStatementPDF(
  company: StatementCompany,
  statement: StatementSummary,
  startDate: string,
  endDate: string,
  generatedAt: Date,
  letterhead: LetterheadConfig,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const accentHex = letterhead.accent_color || "#1E4078";
  const accent = /^#[0-9a-f]{6}$/i.test(accentHex) ? [
    parseInt(accentHex.slice(1, 3), 16), parseInt(accentHex.slice(3, 5), 16), parseInt(accentHex.slice(5, 7), 16),
  ] as [number, number, number] : [30, 64, 120] as [number, number, number];
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = await drawLetterhead(doc, letterhead, "Statement of Account");
  y += 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text("STATEMENT OF ACCOUNT", 14, y + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(`STATEMENT DATE  ${generatedAt.toLocaleDateString("en-GB")}`, pageWidth - 14, y + 2, { align: "right" });
  y += 10;

  doc.setFillColor(246, 248, 252);
  doc.roundedRect(14, y, pageWidth - 28, 26, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(35);
  doc.text(company.company_name, 20, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  const details = [company.address, company.contact_person ? `Attn: ${company.contact_person}` : null, company.phone ? `Tel: ${company.phone}` : null, company.email].filter(Boolean);
  doc.text(doc.splitTextToSize(details.join("   •   ") || "Company contact details not provided", pageWidth - 40), 20, y + 13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text("PERIOD COVERED", pageWidth - 75, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(35);
  doc.text(`${dateLabel(startDate)} — ${dateLabel(endDate)}`, pageWidth - 75, y + 15);
  y += 33;

  const cards = [
    { label: "OPENING BALANCE", value: money(statement.openingBalance), side: statement.openingBalance < 0 ? "CR" : statement.openingBalance > 0 ? "DR" : "—" },
    { label: "TOTAL DEBITS", value: money(statement.totalDebit), side: "DR" },
    { label: "TOTAL CREDITS", value: money(statement.totalCredit), side: "CR" },
    { label: "CLOSING BALANCE", value: money(statement.closingBalance), side: statement.closingSide === "debit" ? "DR" : statement.closingSide === "credit" ? "CR" : "—" },
  ];
  const gap = 4;
  const cardWidth = (pageWidth - 28 - gap * 3) / 4;
  cards.forEach((card, index) => {
    const x = 14 + index * (cardWidth + gap);
    doc.setFillColor(index === 3 ? accent[0] : 248, index === 3 ? accent[1] : 249, index === 3 ? accent[2] : 252);
    doc.roundedRect(x, y, cardWidth, 18, 2, 2, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(index === 3 ? 225 : 115);
    doc.text(card.label, x + 4, y + 6);
    doc.setFontSize(10);
    doc.setTextColor(index === 3 ? 255 : 35);
    doc.text(card.value, x + 4, y + 13);
    doc.setFontSize(7);
    doc.text(card.side, x + cardWidth - 4, y + 13, { align: "right" });
  });
  y += 25;

  autoTable(doc, {
    startY: y,
    head: [["DATE", "DESCRIPTION", "REFERENCE", "DEBIT (GH¢)", "CREDIT (GH¢)", "RUNNING BALANCE (GH¢)"]],
    body: [
      [dateLabel(startDate), "Balance brought forward", "—",
        statement.openingBalance > 0 ? money(statement.openingBalance) : "—",
        statement.openingBalance < 0 ? money(statement.openingBalance) : "—",
        `${money(statement.openingBalance)} ${statement.openingBalance < 0 ? "CR" : statement.openingBalance > 0 ? "DR" : ""}`],
      ...statement.lines.map((line) => [
        dateLabel(line.date), line.description, line.reference,
        line.debit ? money(line.debit) : "—",
        line.credit ? money(line.credit) : "—",
        `${money(line.balance)} ${line.balance < 0 ? "CR" : line.balance > 0 ? "DR" : ""}`,
      ]),
    ],
    foot: [[
      "PERIOD TOTALS", "", "",
      money(statement.totalDebit), money(statement.totalCredit),
      `${money(statement.closingBalance)} ${statement.closingSide === "debit" ? "DR" : statement.closingSide === "credit" ? "CR" : ""}`,
    ]],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3, textColor: [45, 55, 70], lineColor: [225, 230, 238], lineWidth: 0.15 },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    footStyles: { fillColor: [235, 240, 247], textColor: [30, 45, 65], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 35 }, 3: { halign: "right", cellWidth: 34 }, 4: { halign: "right", cellWidth: 34 }, 5: { halign: "right", cellWidth: 43 } },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setDrawColor(225, 230, 238);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
      doc.setFontSize(7);
      doc.setTextColor(130);
      doc.text("Accounts Receivable sub-ledger • Provisional and actual WHT are reported separately in tax reconciliation.", 14, pageHeight - 7);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - 14, pageHeight - 7, { align: "right" });
    },
  });

  const closingText = statement.closingSide === "debit"
    ? "DEBIT BALANCE — the company has an outstanding amount payable to the facility."
    : statement.closingSide === "credit"
      ? "CREDIT BALANCE — the facility has an unapplied credit in the company's account."
      : "BALANCED — no debit or credit balance remains at the end of this period.";
  const pageHeight = doc.internal.pageSize.getHeight();
  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y;
  if (finalY < pageHeight - 24) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(closingText, 14, finalY + 9);
  }
  const safeName = company.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
  doc.save(`statement-of-account-${safeName}-${startDate}-to-${endDate}.pdf`);
}
