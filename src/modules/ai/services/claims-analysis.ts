import { getAIProvider } from "../index";

export interface ClaimsSnapshot {
  submitted: number;
  rejected: number;
  paid: number;
  outstanding: number;
  rejectionRate: number;
  collectionRate: number;
  byInsurer?: Array<{ name: string; submitted: number; paid: number; rejected: number }>;
}

const SYSTEM = "You are a hospital revenue-cycle analyst. Be concise, quantitative, and use GH¢ for currency.";

export async function analyzePerformance(snapshot: ClaimsSnapshot) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Analyse claims performance and highlight the three biggest revenue risks." },
    ],
    context: snapshot,
  });
}

export async function explainRejections(snapshot: ClaimsSnapshot & { reasons?: Record<string, number> }) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Explain why claims are being rejected and how to reduce the rejection rate." },
    ],
    context: snapshot,
  });
}

export async function identifyTrends(monthly: Array<{ period: string; submitted: number; paid: number; rejected: number }>) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Identify trends, seasonality, and inflection points in this monthly claims series." },
    ],
    context: { monthly },
  });
}