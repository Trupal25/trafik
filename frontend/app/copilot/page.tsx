"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Plus, KeyRound, AlertTriangle, MessageSquare, Cpu } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ChatMessage, TypingIndicator } from "@/components/copilot/chat-message";
import { ChatInput } from "@/components/copilot/chat-input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CopilotMessage, CopilotResponse } from "@/lib/types";

interface ConversationMeta {
  id: string;
  title: string;
  message_count: number;
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [available, setAvailable] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversation list on mount (no key needed for this endpoint).
  useEffect(() => {
    api.copilotConversations().then(setConversations).catch(() => {});
  }, []);

  // Auto-scroll to latest message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isGenerating]);

  const send = useCallback(
    async (text: string) => {
      const userMsg: CopilotMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsGenerating(true);
      setError(null);

      try {
        const res: CopilotResponse = await api.copilot({
          conversation_id: conversationId ?? undefined,
          message: text,
        });
        setConversationId(res.conversation_id);
        setMessages((prev) => [...prev, res.message]);
        // Refresh conversation list.
        api.copilotConversations().then(setConversations).catch(() => {});
        setAvailable(true);
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : new ApiError(0, String(err), "copilot");
        setError(apiErr);
        if (apiErr.status === 503) setAvailable(false);
      } finally {
        setIsGenerating(false);
      }
    },
    [conversationId]
  );

  const newConversation = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="06 / Natural Language"
        title="AI Copilot"
        description="Ask any traffic question in plain English. Llama 3.3 grounds every answer in the live dataset via tool-calling over the dashboard, hotspot, and simulation endpoints."
        meta={
          <span className="label-meta flex items-center gap-1.5">
            <Cpu className="size-3 text-primary" strokeWidth={2} />
            Groq · llama-3.3-70b-versatile · 5 tools
          </span>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation sidebar */}
        <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
          <div className="border-b border-sidebar-border p-3">
            <button
              type="button"
              onClick={newConversation}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/12 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-primary transition-colors hover:bg-primary/20"
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              New Conversation
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <span className="label-section px-2 py-1.5">History</span>
            {conversations.length === 0 ? (
              <div className="px-2 py-4 text-center">
                <MessageSquare className="mx-auto size-4 text-muted-foreground/40" strokeWidth={1.5} />
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">
                  No conversations yet.
                </p>
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setConversationId(c.id); setMessages([]); }}
                  className={cn(
                    "mt-0.5 flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left transition-colors",
                    c.id === conversationId
                      ? "bg-primary/12 text-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent"
                  )}
                >
                  <span className="truncate text-[12px] font-medium">{c.title}</span>
                  <span className="label-meta">{c.message_count} messages</span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat column */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Not-wired banner */}
          {!available && (
            <div className="border-b border-[var(--critical)]/30 bg-[var(--critical)]/8 px-6 py-3">
              <div className="flex items-start gap-2.5">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-[var(--critical)]" strokeWidth={2} />
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium text-foreground">
                    Copilot needs a Groq API key
                  </span>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    Add <code className="rounded-sm bg-muted/40 px-1 py-0.5 font-mono text-[11px] text-foreground">GROQ_API_KEY=your-key</code> to the project-root <code className="rounded-sm bg-muted/40 px-1 py-0.5 font-mono text-[11px] text-foreground">.env</code> file, restart uvicorn, then retry. Free keys at{" "}
                    <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:no-underline">
                      console.groq.com/keys
                    </a>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
            {messages.length === 0 && !isGenerating ? (
              <EmptyState onSuggestion={send} hasError={!!error} />
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-5">
                {messages.map((m) => (
                  <ChatMessage key={m.id} message={m} />
                ))}
                {isGenerating && <TypingIndicator />}
                {error && error.status !== 503 && (
                  <div className="surface mx-auto max-w-md p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-[var(--critical)]" strokeWidth={2} />
                      <span className="text-[13px] font-medium text-foreground">Request failed</span>
                    </div>
                    <p className="mt-1.5 text-[12px] text-muted-foreground">{error.detail}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <ChatInput onSend={send} disabled={isGenerating} />
        </div>
      </div>
    </>
  );
}

function EmptyState({
  onSuggestion,
  hasError,
}: {
  onSuggestion: (msg: string) => void;
  hasError: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary/8">
        <Bot className="size-7 text-primary" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Ask UrbanPulse AI
        </h2>
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
          I query the live Bengaluru traffic database directly — 8,170 real
          incidents, 155 hotspots, real junction data. Ask about current risk,
          historical patterns, or run a what-if simulation.
        </p>
      </div>
      {!hasError && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {[
            "What's the current city risk?",
            "Show critical hotspots",
            "Simulate a public event at Silk Board",
          ].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/8 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
