import type { AICompletionRequest, AIProvider } from "../types";

/**
 * Offline fallback provider. Produces deterministic, rules-based output from the
 * supplied context so the app stays usable when no gateway is reachable.
 */
export const localModelProvider: AIProvider = {
  name: "local-model",
  async complete({ messages, context }: AICompletionRequest) {
    const question = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const facts = context
      ? Object.entries(context)
          .map(([k, v]) => `• ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
          .join("\n")
      : "No context supplied.";
    return `Offline analysis (local model)\n\nQuestion: ${question}\n\nAvailable figures:\n${facts}\n\nConnect the AI gateway for full narrative analysis.`;
  },
};