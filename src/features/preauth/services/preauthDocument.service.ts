import { supabase } from "@/integrations/supabase/client";

export interface PreAuthDocumentRegistration {
  preauth_id: string;
  version_number: number;
  document_type?: string;
  format?: string;
  storage_provider?: string | null;
  storage_path?: string | null;
  content_sha256?: string | null;
  status?: "pending" | "generated" | "failed" | "superseded";
  metadata?: Record<string, unknown>;
}

export async function registerPreAuthDocument(input: PreAuthDocumentRegistration) {
  const { data, error } = await (supabase.rpc as any)("register_preauth_document", {
    p_preauth_id: input.preauth_id,
    p_version_number: input.version_number,
    p_document_type: input.document_type ?? "preauthorization_request",
    p_format: input.format ?? "pdf",
    p_storage_provider: input.storage_provider ?? null,
    p_storage_path: input.storage_path ?? null,
    p_content_sha256: input.content_sha256 ?? null,
    p_status: input.status ?? "generated",
    p_metadata: input.metadata ?? {},
  });

  if (error) throw error;
  return data;
}

export async function listPreAuthDocuments(preauthId: string) {
  if (!preauthId) throw new Error("Pre-authorization ID is required");

  const { data, error } = await (supabase as any)
    .from("preauth_documents")

    .select(
      "id,preauth_id,version_number,document_type,format,storage_provider,storage_path,content_sha256,status,generated_by,created_at,metadata",
    )
    .eq("preauth_id", preauthId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
