import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { registerPreAuthDocument } from "./preauthDocument.service";

export interface PreAuthSnapshot {
  id: string;
  request_number?: string | null;
  client_name?: string | null;
  client_date_of_birth?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  client_address?: string | null;
  client_identifier?: string | null;
  client_membership_number?: string | null;
  insurer_name?: string | null;
  insurer_member_number?: string | null;
  insurer_plan_name?: string | null;
  insurer_policy_reference?: string | null;
  insurer_phone?: string | null;
  insurer_email?: string | null;
  provider_name?: string | null;
  provider_address?: string | null;
  provider_phone?: string | null;
  diagnosis?: string | null;
  procedure_date?: string | null;
  status?: string | null;
  total_cost?: number | string | null;
  [key: string]: unknown;
}

export async function getPreAuthVersionSnapshot(preauthId: string, versionNumber: number): Promise<PreAuthSnapshot> {
  if (!preauthId || !Number.isInteger(versionNumber) || versionNumber < 1) throw new Error("A valid pre-authorization version is required.");
  const { data, error } = await (supabase.from("preauthorization_versions") as any)
    .select("snapshot")
    .eq("preauth_id", preauthId)
    .eq("version_number", versionNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data?.snapshot) throw new Error("The requested immutable pre-authorization version was not found.");
  return data.snapshot as PreAuthSnapshot;
}

async function sha256(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export async function renderPreAuthVersionPdf(preauthId: string, versionNumber: number): Promise<Blob> {
  const snapshot = await getPreAuthVersionSnapshot(preauthId, versionNumber);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  let y = 18;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(text(snapshot.provider_name) || "Healthcare Provider", margin, y);
  y += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(text(snapshot.provider_address), margin, y);
  y += 5;
  doc.text(text(snapshot.provider_phone), margin, y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PRE-AUTHORIZATION REQUEST", margin, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Request: ${text(snapshot.request_number)}   Version: ${versionNumber}   Status: ${text(snapshot.status)}`, margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    head: [["Client / Patient", "Insurance / Payer"]],
    body: [[
      `Name: ${text(snapshot.client_name)}\nDOB: ${text(snapshot.client_date_of_birth)}\nPhone: ${text(snapshot.client_phone)}\nEmail: ${text(snapshot.client_email)}\nIdentifier: ${text(snapshot.client_identifier)}\nMembership: ${text(snapshot.client_membership_number)}\nAddress: ${text(snapshot.client_address)}`,
      `Insurer: ${text(snapshot.insurer_name)}\nMember: ${text(snapshot.insurer_member_number)}\nPlan: ${text(snapshot.insurer_plan_name)}\nPolicy: ${text(snapshot.insurer_policy_reference)}\nPhone: ${text(snapshot.insurer_phone)}\nEmail: ${text(snapshot.insurer_email)}`,
    ]],
  });

  y = (doc as any).lastAutoTable.finalY + 7;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    head: [["Clinical / Request Details", "Value"]],
    body: [
      ["Diagnosis", text(snapshot.diagnosis)],
      ["Procedure date", text(snapshot.procedure_date)],
      ["Total requested", text(snapshot.total_cost)],
    ],
  });

  y = (doc as any).lastAutoTable.finalY + 7;
  const rawItems = Array.isArray(snapshot.items) ? snapshot.items as Array<Record<string, unknown>> : [];
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    head: [["Service / Charge", "Qty", "Unit", "Amount"]],
    body: rawItems.map((item) => [text(item.description), text(item.quantity), text(item.unit_price), text(item.amount ?? (Number(item.quantity) * Number(item.unit_price)).toFixed(2))]),
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Generated from immutable pre-authorization version data.", margin, pageHeight - 10);
  return doc.output("blob");
}

export async function generateAndRegisterPreAuthVersionPdf(preauthId: string, versionNumber: number) {
  const blob = await renderPreAuthVersionPdf(preauthId, versionNumber);
  const contentSha256 = await sha256(blob);
  const registration = await registerPreAuthDocument({
    preauth_id: preauthId,
    version_number: versionNumber,
    document_type: "preauthorization_request",
    format: "pdf",
    content_sha256: contentSha256,
    status: "generated",
    metadata: { renderer: "careflow-preauth-pdf-v1", byte_length: blob.size },
  });
  return { blob, contentSha256, registration };
}
