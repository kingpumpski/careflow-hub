import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { usePermissions } from "@/modules/security/usePermissions";
import type { MonthlyClaimSubmissionArgs } from "./monthlyClaimSubmission";

export type MonthlyClaimSubmissionResult = {
  claim_id: string;
  tax_rate: number;
  tax_amount: number;
};

type RpcResult = {
  data: MonthlyClaimSubmissionResult | null;
  error: { message: string } | null;
};

export function useMonthlyClaimSubmission() {
  const queryClient = useQueryClient();
  const { can, loading: permissionsLoading } = usePermissions();

  return useMutation({
    mutationFn: async (args: MonthlyClaimSubmissionArgs) => {
      if (permissionsLoading) {
        throw new Error("Permissions are still loading. Please try again in a moment.");
      }

      const requiredPermissions = ["claims.write", "claims.submit_monthly"] as const;
      const missingPermissions = requiredPermissions.filter((permission) => !can(permission));
      if (missingPermissions.length > 0) {
        throw new Error("Monthly claim submission requires claims.write and the dedicated monthly-claim submission permission.");
      }

      if (getCareFlowDataMode() === "offline") {
        throw new Error("Monthly claim submission requires an online connection so all financial records can be saved together.");
      }

      const rpc = supabase.rpc.bind(supabase) as unknown as (
        functionName: "submit_monthly_claim_atomic",
        parameters: MonthlyClaimSubmissionArgs,
      ) => Promise<RpcResult>;
      const { data, error } = await rpc("submit_monthly_claim_atomic", args);
      if (error) throw new Error(error.message);
      if (!data?.claim_id) throw new Error("The database did not confirm the monthly claim submission.");
      return data;
    },
    onSuccess: async () => {
      await Promise.all(
        ["claims", "withholding_tax", "ledger_entries", "claims_outstanding_periods"].map((table) =>
          queryClient.invalidateQueries({ queryKey: [table] }),
        ),
      );
    },
  });
}
