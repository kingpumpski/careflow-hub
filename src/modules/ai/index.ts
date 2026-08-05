import { geminiProvider } from "./providers/gemini";
import { openaiProvider } from "./providers/openai";
import { localModelProvider } from "./providers/local-model";
import type { AIProvider } from "./types";

export const providers: Record<string, AIProvider> = {
  gemini: geminiProvider,
  openai: openaiProvider,
  "local-model": localModelProvider,
};

let active: AIProvider = geminiProvider;

export function setAIProvider(name: keyof typeof providers) {
  active = providers[name] ?? geminiProvider;
}

export function getAIProvider(): AIProvider {
  return active;
}

export * from "./types";