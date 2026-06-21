"use client";

import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntelligenceCard } from "./intelligence-card";
import type { CopilotMessage } from "@/lib/types";

export function ChatMessage({ message }: { message: CopilotMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border",
          isUser
            ? "border-border bg-secondary text-secondary-foreground"
            : "border-primary/40 bg-primary/12 text-primary"
        )}
      >
        {isUser ? <User className="size-3.5" strokeWidth={2} /> : <Bot className="size-3.5" strokeWidth={2} />}
      </div>

      {/* Bubble */}
      <div className={cn("flex max-w-[78%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div className="flex items-center gap-2">
          <span className="label-meta">{isUser ? "You" : "UrbanPulse AI"}</span>
        </div>
        <div
          className={cn(
            "rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed",
            isUser
              ? "bg-primary/12 text-foreground"
              : "border border-border bg-card text-foreground"
          )}
        >
          {message.content || (message.card ? null : "—")}
        </div>
        {!isUser && message.card && <IntelligenceCard card={message.card} />}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/12 text-primary">
        <Bot className="size-3.5" strokeWidth={2} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="label-meta">UrbanPulse AI</span>
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-3.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 rounded-full bg-primary"
              style={{
                animation: "pulse-marker 0.9s ease-in-out infinite",
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
