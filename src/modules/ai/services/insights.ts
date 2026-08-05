import { getAIProvider } from "../index";

const SYSTEM = "You are the executive advisor for a hospital claims operation. Answer in short, prioritised bullets. Currency: GH¢.";

export async function managementRecommendations(context: object) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Give management the top five actions to improve collections and reduce rejections this quarter." },
    ],
    context,
  });
}

export async function explainIncomeStatement(context: object) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Explain this income statement in plain language for non-accountants." },
    ],
    context,
  });
}

export async function askInsight(question: string, context: object) {
  return getAIProvider().complete({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: question },
    ],
    context,
  });
}