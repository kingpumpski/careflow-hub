import { supabase } from "@/integrations/supabase/client";
import type { AICompletionRequest, AIProvider } from "../types";

/**
 * OpenAI-backed provider. Uses the same server-side `chat` edge function so the
 * gateway key stays on the server; the model family is selected server-side.
 */
export const openaiProvider: AIProvider = {
  name: "openai",
  async complete({ messages, context }: AICompletionRequest) {
    const payload = context
      ? [...messages, { role: "user" as const, content: `Context data (JSON):\n${JSON.stringify(context)}` }]
      : messages;

    const { data, error } = await supabase.functions.invoke("chat", {
      body: { messages: payload, provider: "openai" },
    });
    if (error) throw new Error(error.message);
    return (data as any)?.reply ?? (data as any)?.content ?? (typeof data === "string" ? data : "");
  },
};