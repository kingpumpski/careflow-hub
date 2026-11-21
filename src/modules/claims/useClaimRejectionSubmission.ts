import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { usePermissions } from "@/modules/security/usePermissions";
import type { ClaimRejectionSubmissionArgs } from "./monthlyClaimSubmission";

export type ClaimRejectionSubmissionResult = {
  claim_id: string;
  tax_rate: number;
  tax_amount: number;
};

type RpcResult = {
  data: ClaimRejectionSubmissionResult | null;
  error: { message: string } | null;
};

export function useClaimRejectionSubmission() {
  const queryClient = useQueryClient();
  const { can, loading: permissionsLoading } = usePermissions();

  return useMutation({
    mutationFn: async (args: ClaimRejectionSubmissionArgs) => {
      if (permissionsLoading) {
        throw new Error("Permissions are still loading. Please try again in a moment.");
      }

      const requiredPermissions = ["claims.write", "payments.write", "ledger.write"] as const;
      if (requiredPermissions.some((permission) => !can(permission))) {
        throw new Error("Recording a claim rejection requires claims, withholding-tax and ledger write permissions.");
      }

      if (getCareFlowDataMode() === "offline") {
        throw new Error("Recording a claim rejection requires an online connection so all financial records can be saved together.");
      }

      const rpc = supabase.rpc.bind(supabase) as unknown as (
        functionName: "submit_claim_rejection_atomic",
        parameters: ClaimRejectionSubmissionArgs,
      ) => Promise<RpcResult>;
      const { data, error } = await rpc("submit_claim_rejection_atomic", args);
      if (error) throw new Error(error.message);
      if (!data?.claim_id) throw new Error("The database did not confirm the claim rejection.");
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
