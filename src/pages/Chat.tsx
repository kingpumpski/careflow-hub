import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, Megaphone, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { cn } from "@/lib/utils";

interface ChatMsg {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  subject: string | null;
  body: string;
  is_broadcast: boolean;
  thread_key: string | null;
  read_by: string[];
  created_at: string;
}

const threadKey = (a: string, b: string) => [a, b].sort().join("|");

export default function Chat() {
  const { user } = useAuth();
  const { data: profiles } = useSupabaseQuery("profiles");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("__broadcast__");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const otherUsers = useMemo(
    () => (profiles || []).filter((p: any) => p.id !== user?.id),
    [profiles, user],
  );
  const filteredUsers = useMemo(
    () => otherUsers.filter((p: any) =>
      !search || (p.full_name || "").toLowerCase().includes(search.toLowerCase()) || (p.email || "").toLowerCase().includes(search.toLowerCase())
    ),
    [otherUsers, search],
  );

  // Load messages on selection change
  const loadMessages = async () => {
    if (!user) return;
    let query = (supabase.from("chat_messages") as any).select("*").order("created_at", { ascending: true });
    if (selectedUserId === "__broadcast__") {
      query = query.eq("is_broadcast", true);
    } else {
      query = query.eq("is_broadcast", false).eq("thread_key", threadKey(user.id, selectedUserId));
    }
    const { data, error } = await query;
    if (error) { toast({ title: "Load failed", description: error.message, variant: "destructive" }); return; }
    setMessages((data || []) as ChatMsg[]);
    // mark read
    const unread = (data || []).filter((m: ChatMsg) => !m.read_by?.includes(user.id) && m.sender_id !== user.id);
    for (const m of unread) {
      await (supabase.from("chat_messages") as any)
        .update({ read_by: [...(m.read_by || []), user.id] })
        .eq("id", m.id);
    }
  };

  useEffect(() => { loadMessages(); /* eslint-disable-line */ }, [selectedUserId, user?.id]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("chat-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        loadMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line
  }, [user?.id, selectedUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!user || !body.trim()) return;
    setSending(true);
    try {
      const isBroadcast = selectedUserId === "__broadcast__";
      const payload: any = {
        sender_id: user.id,
        recipient_id: isBroadcast ? null : selectedUserId,
        subject: subject.trim() || null,
        body: body.trim(),
        is_broadcast: isBroadcast,
        thread_key: isBroadcast ? null : threadKey(user.id, selectedUserId),
      };
      const { error } = await (supabase.from("chat_messages") as any).insert(payload);
      if (error) throw error;
      setBody("");
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const nameFor = (id?: string | null) => {
    if (!id) return "Broadcast";
    if (id === user?.id) return "You";
    const p = (profiles || []).find((x: any) => x.id === id);
    return p?.full_name || p?.email || id.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><MessageSquare className="w-6 h-6 text-primary" />Internal Chat</h1>
        <p className="page-description">Private one-to-one conversations and system-wide announcements</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-220px)]">
        {/* Sidebar list */}
        <div className="stat-card !p-0 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search users..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => setSelectedUserId("__broadcast__")}
              className={cn(
                "w-full text-left px-4 py-3 border-b border-border hover:bg-muted transition-colors flex items-center gap-3",
                selectedUserId === "__broadcast__" && "bg-primary/5 border-l-2 border-l-primary"
              )}
            >
              <Megaphone className="w-4 h-4 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">All Users (Broadcast)</p>
                <p className="text-xs text-muted-foreground">Announcements & updates</p>
              </div>
            </button>
            <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 flex items-center gap-2">
              <Users className="w-3 h-3" />Direct Messages
            </div>
            {filteredUsers.map((p: any) => (
              <button
                key={p.id}
                onClick={() => setSelectedUserId(p.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border hover:bg-muted transition-colors",
                  selectedUserId === p.id && "bg-primary/5 border-l-2 border-l-primary"
                )}
              >
                <p className="text-sm font-medium truncate">{p.full_name || p.email}</p>
                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No other users found</p>
            )}
          </div>
        </div>

        {/* Conversation */}
        <div className="stat-card !p-0 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-heading font-semibold flex items-center gap-2">
                {selectedUserId === "__broadcast__" ? <><Megaphone className="w-4 h-4 text-primary" />Broadcast Channel</> : nameFor(selectedUserId)}
              </h3>
              <p className="text-xs text-muted-foreground">
                {selectedUserId === "__broadcast__" ? "Visible to everyone in the system" : "Private conversation — only you and the recipient can read this"}
              </p>
            </div>
            <Badge variant="outline">{messages.length} message{messages.length === 1 ? "" : "s"}</Badge>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-12">
                No messages yet. Start the conversation below.
              </div>
            )}
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[70%] rounded-lg px-3 py-2 shadow-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-card border border-border"
                  )}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn("text-[10px] font-semibold", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {mine ? "You" : nameFor(m.sender_id)}
                      </span>
                      <span className={cn("text-[10px]", mine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                    </div>
                    {m.subject && <p className={cn("text-xs font-semibold mb-1", mine ? "text-primary-foreground" : "")}>{m.subject}</p>}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-border space-y-2 bg-card">
            <Input
              placeholder="Subject (optional)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Textarea
                placeholder={selectedUserId === "__broadcast__" ? "Broadcast a message to all users..." : "Type your message..."}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                className="text-sm resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
                }}
              />
              <Button onClick={send} disabled={sending || !body.trim()} className="gap-2 self-end">
                <Send className="w-4 h-4" />Send
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Ctrl/Cmd + Enter to send</p>
          </div>
        </div>
      </div>
    </div>
  );
}
