import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Loader2, X, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface Message { role: "user" | "assistant"; content: string }

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const suggestions = [
  "What is the outstanding for each company?",
  "Explain the income statement",
  "Which insurers have overdue payments?",
  "How do I create a pre-authorization?",
];

async function streamChat({ messages, onDelta, onDone, onError }: {
  messages: Message[];
  onDelta: (t: string) => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 429) return onError("Aidah is rate limited. Please retry shortly.");
    if (resp.status === 402) return onError("AI credits exhausted. Please top up to continue.");
    return onError((data as any).error || "AI service error");
  }
  if (!resp.body) return onError("No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { onDone(); return; }
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }
  onDone();
}

const GREETING: Message = {
  role: "assistant",
  content: "Hi, I'm **Aidah** — your claims intelligence agent. Ask me about outstanding balances, rejections, reports, or how any part of the system works.",
};

/** Floating Aidah chat agent, available on every authenticated screen. */
export default function AidahBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const sendMessage = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || isLoading) return;
    setInput("");
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let soFar = "";
    const all = [...messages, userMsg];
    try {
      await streamChat({
        messages: all,
        onDelta: (chunk) => {
          soFar += chunk;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && prev.length > all.length) {
              return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: soFar } : m));
            }
            return [...prev, { role: "assistant", content: soFar }];
          });
        },
        onDone: () => setIsLoading(false),
        onError: (msg) => { toast.error(msg); setIsLoading(false); },
      });
    } catch {
      toast.error("Failed to connect to Aidah");
      setIsLoading(false);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed z-[60] bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[400px] max-w-[400px] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200 print:hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground">
            <div className="w-8 h-8 rounded-full bg-primary-foreground/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-semibold text-sm leading-none">Aidah</p>
              <p className="text-[11px] opacity-80 mt-0.5">Claims intelligence agent</p>
            </div>
            <button aria-label="Minimize Aidah" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-primary-foreground/15">
              <Minus className="w-4 h-4" />
            </button>
            <button aria-label="Close Aidah" onClick={() => { setOpen(false); setMessages([GREETING]); }} className="p-1 rounded hover:bg-primary-foreground/15">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 p-4 overflow-y-auto max-h-[45vh] min-h-[220px]">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : m.content}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Aidah is thinking...
                </div>
              </div>
            )}
          </div>

          {messages.length === 1 && (
            <div className="px-4 pb-2 grid gap-1.5">
              {suggestions.map((s) => (
                <button key={s} onClick={() => sendMessage(s)} className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground">
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 p-3 border-t border-border">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask Aidah anything..."
              className="flex-1 min-h-[40px] max-h-[100px] resize-none text-sm"
              rows={1}
            />
            <Button onClick={() => sendMessage()} size="icon" disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}

      <button
        aria-label={open ? "Hide Aidah" : "Chat with Aidah"}
        onClick={() => setOpen((o) => !o)}
        className="fixed z-[60] bottom-5 right-4 sm:right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform print:hidden"
      >
        {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
      </button>
    </>
  );
}
