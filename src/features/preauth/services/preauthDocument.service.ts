import { supabase } from "@/integrations/supabase/client";

export interface PreAuthDocumentRegistryRecord {
  id: string;
  preauth_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  snapshot_hash: string;
  document_name: string;
  document_format: "pdf";
  status: "prepared" | "superseded";
  created_by: string;
  facility_id: string;
  created_at: string;
}

const REGISTRY_COLUMNS = "id,preauth_id,version_number,snapshot,snapshot_hash,document_name,document_format,status,created_by,facility_id,created_at";

/**
 * Lists immutable document registrations created by the prepared-handoff
 * finalizer. This is deliberately a read-only client path: registration is
 * performed atomically by finalize_preauthorization_handoff.
 */
export async function listPreAuthDocuments(preauthId: string): Promise<PreAuthDocumentRegistryRecord[]> {
  if (!preauthId) throw new Error("Pre-authorization ID is required");

  const { data, error } = await (supabase as any)
    .from("preauth_document_registry")
    .select(REGISTRY_COLUMNS)
    .eq("preauth_id", preauthId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PreAuthDocumentRegistryRecord[];
}

export async function getPreAuthDocument(
  preauthId: string,
  versionNumber: number,
): Promise<PreAuthDocumentRegistryRecord | null> {
  if (!preauthId || !Number.isInteger(versionNumber) || versionNumber < 1) {
    throw new Error("A valid pre-authorization document revision is required");
  }

  const { data, error } = await (supabase as any)
    .from("preauth_document_registry")
    .select(REGISTRY_COLUMNS)
    .eq("preauth_id", preauthId)
    .eq("version_number", versionNumber)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as PreAuthDocumentRegistryRecord | null;
}
