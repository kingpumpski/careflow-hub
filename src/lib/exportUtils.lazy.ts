import type jsPDF from "jspdf";
import type { BankingPartner, LetterheadConfig } from "./exportUtils";

export type { BankingPartner, LetterheadConfig };

const load = () => import("./exportUtils");

export async function exportClaimsPDF(data: any[], totals: Parameters<Awaited<ReturnType<typeof load>>["exportClaimsPDF"]>[1]) {
  const { exportClaimsPDF: exportPdf } = await load();
  return exportPdf(data, totals);
}

export async function exportClaimsExcel(data: any[], totals: Parameters<Awaited<ReturnType<typeof load>>["exportClaimsExcel"]>[1]) {
  const { exportClaimsExcel: exportExcel } = await load();
  return exportExcel(data, totals);
}

export async function loadImageDataUrl(url?: string) {
  const { loadImageDataUrl: loadImage } = await load();
  return loadImage(url);
}

export async function exportPreAuthPDF(preauth: any, items: any[], companyInfo: LetterheadConfig) {
  const { exportPreAuthPDF: exportPdf } = await load();
  return exportPdf(preauth, items, companyInfo);
}

export async function preAuthPdfBase64(preauth: any, items: any[], companyInfo: LetterheadConfig) {
  const { preAuthPdfBase64: buildPdf } = await load();
  return buildPdf(preauth, items, companyInfo);
}

export async function drawLetterhead(doc: jsPDF, cfg: LetterheadConfig, title: string) {
  const { drawLetterhead: draw } = await load();
  return draw(doc, cfg, title);
}

export async function drawBankingFooter(doc: jsPDF, cfg: LetterheadConfig) {
  const { drawBankingFooter: draw } = await load();
  return draw(doc, cfg);
}

export async function exportReportPDF(title: string, data: any[], columns: string[], companyInfo: LetterheadConfig) {
  const { exportReportPDF: exportPdf } = await load();
  return exportPdf(title, data, columns, companyInfo);
}

export async function exportReportExcel(title: string, rows: any[], sheetName: string) {
  const { exportReportExcel: exportExcel } = await load();
  return exportExcel(title, rows, sheetName);
}
