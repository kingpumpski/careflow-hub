import { buildPreAuthDocumentPayload, type PreAuthReviewInput } from "./preauth-review";

export type PreAuthFrozenSnapshot = ReturnType<typeof buildPreAuthDocumentPayload>;

/**
 * Rebuilds the canonical business snapshot from the review state and compares it
 * with the snapshot that was frozen for a revision. This is deliberately strict:
 * a PDF/email handoff must never silently use data different from the frozen
 * revision recorded in the database.
 */
export function assertPreAuthSnapshotMatchesReviewInput(
  snapshot: PreAuthFrozenSnapshot,
  input: PreAuthReviewInput,
): void {
  const rebuilt = buildPreAuthDocumentPayload(input, snapshot.requestNumber || undefined);
  if (JSON.stringify(rebuilt) !== JSON.stringify(snapshot)) {
    throw new Error("The editable request no longer matches the frozen revision. Reload the revision before generating the PDF or email package.");
  }
}

/**
 * Converts a frozen snapshot into the minimal charge-line representation used
 * by the PDF renderer. UI-only row identifiers are intentionally absent.
 */
export function frozenSnapshotItems(snapshot: PreAuthFrozenSnapshot) {
  return snapshot.document.items.map((item, index) => ({
    id: `frozen-${index + 1}`,
    category: item.category,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}
