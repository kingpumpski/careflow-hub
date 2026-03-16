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

export function exportPreAuthPDF(preauth: any, items: any[], companyInfo: any) {
  const doc = new jsPDF();

  // Company header
  doc.setFontSize(16);
  doc.text(companyInfo?.provider_name || "Medical Facility", 14, 20);
  doc.setFontSize(9);
  doc.setTextColor(100);
  if (companyInfo?.provider_address) doc.text(companyInfo.provider_address, 14, 27);
  if (companyInfo?.provider_phone) doc.text(`Tel: ${companyInfo.provider_phone}`, 14, 33);

  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text("Pre-Authorization Request", 14, 45);

  doc.setFontSize(10);
  let y = 55;
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
    headStyles: { fillColor: [30, 64, 120] },
    footStyles: { fillColor: [220, 240, 220], textColor: [0, 0, 0], fontStyle: "bold" },
  });

  doc.save(`preauth-${preauth.id?.slice(0, 8) || "request"}.pdf`);
}

export function exportReportPDF(title: string, data: any[], columns: string[], companyInfo: any) {
  const doc = new jsPDF("landscape");

  doc.setFontSize(16);
  doc.text(companyInfo?.provider_name || "Medical Facility", 14, 20);
  doc.setFontSize(9);
  doc.setTextColor(100);
  if (companyInfo?.provider_address) doc.text(companyInfo.provider_address, 14, 27);
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(title, 14, 38);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 45);

  autoTable(doc, {
    startY: 52,
    head: [columns],
    body: data,
    theme: "grid",
    headStyles: { fillColor: [30, 64, 120] },
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

export function exportReportExcel(title: string, rows: any[], sheetName: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${title.toLowerCase().replace(/\s+/g, "-")}.xlsx`);
}
