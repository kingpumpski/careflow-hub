import { supabase } from "@/integrations/supabase/client";
import type { AICompletionRequest, AIProvider } from "../types";

/**
 * Default provider. Calls the server-side `chat` edge function which talks to
 * the Lovable AI Gateway (Gemini family) — no API key ever reaches the browser.
 */
export const geminiProvider: AIProvider = {
  name: "gemini",
  async complete({ messages, context }: AICompletionRequest) {
    const payload = context
      ? [...messages, { role: "user" as const, content: `Context data (JSON):\n${JSON.stringify(context)}` }]
      : messages;

    const { data, error } = await supabase.functions.invoke("chat", {
      body: { messages: payload },
    });
    if (error) throw new Error(error.message);
    return (data as any)?.reply ?? (data as any)?.content ?? (typeof data === "string" ? data : "");
  },
};