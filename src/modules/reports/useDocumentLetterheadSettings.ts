import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingLetterheadSettingsRpc } from "@/modules/reports/letterheadSettings";
import { databaseCapabilities } from "@/config/databaseCapabilities";

const LETTERHEAD_SETTING_KEYS = [
  "provider_name",
  "provider_address",
  "provider_phone",
  "provider_email",
  "logo_url",
  "letterhead_accent",
  "letterhead_style",
  "letterhead_footer_note",
] as const;

export type DocumentLetterheadSetting = {
  key: string;
  value: string | null;
};

/**
 * Read only the approved company-branding settings for users who can create
 * reports, statements, claims documents or pre-authorization documents.
 *
 * Older databases may not have the dedicated RPC. In that case only a user
 * with settings.manage may use the narrow key allowlist fallback; ordinary
 * operational users never receive broad system_settings access.
 */
export function useDocumentLetterheadSettings({
  canReadDocument,
  canManageSettings,
}: {
  canReadDocument: boolean;
  canManageSettings: boolean;
}) {

  return useQuery({
    queryKey: ["document-letterhead-settings", canReadDocument, canManageSettings],
    enabled: canReadDocument,
    queryFn: async (): Promise<DocumentLetterheadSetting[]> => {
      const loadAdminFallback = async () => {
        if (!canManageSettings) return [];
        const fallback = await supabase
          .from("system_settings")
          .select("key, value")
          .in("key", [...LETTERHEAD_SETTING_KEYS]);
        if (fallback.error) throw fallback.error;
        return (fallback.data ?? []) as DocumentLetterheadSetting[];
      };

      if (!databaseCapabilities.documentLetterheadSettings) return loadAdminFallback();

      const { data, error } = await supabase.rpc("get_report_letterhead_settings");
      if (!error) return (data ?? []) as DocumentLetterheadSetting[];
      if (!isMissingLetterheadSettingsRpc(error)) throw error;
      return loadAdminFallback();

    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => !isMissingLetterheadSettingsRpc(error) && failureCount < 2,
  });
}
