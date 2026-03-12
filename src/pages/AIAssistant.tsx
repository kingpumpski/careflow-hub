import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const suggestions = [
  "How do I create a pre-authorization?",
  "Show me claims statistics for March",
  "Which insurers have overdue payments?",
  "Help me generate a monthly report",
];

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I'm your MedClaims AI Assistant. I can help you navigate the system, answer questions about claims, and generate reports. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: input },
      { role: "assistant", content: "I'm currently running with demo data. Once the AI backend is connected, I'll be able to help you with real-time insights, report generation, and anomaly detection. Stay tuned!" },
    ]);
    setInput("");
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="page-header text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Bot className="w-7 h-7 text-primary" />
        </div>
        <h1 className="page-title">AI Assistant</h1>
        <p className="page-description">Get help navigating the system and analyzing data</p>
      </div>

      <div className="stat-card min-h-[400px] flex flex-col">
        <div className="flex-1 space-y-4 mb-4 overflow-y-auto max-h-[500px]">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}>
                {m.content}
              </div>
            </div>
          ))}
        </div>

        {messages.length === 1 && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => { setInput(s); }}
                className="text-left text-xs p-3 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask me anything about your claims..."
            className="flex-1"
          />
          <Button onClick={sendMessage} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
