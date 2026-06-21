"use client";

import { useState, type FormEvent } from "react";
import { Send, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "What's the current city risk?",
  "Show critical hotspots",
  "Simulate a public event at Silk Board",
  "Which zone has the most accidents?",
  "What causes the most incidents?",
];

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => !disabled && onSend(s)}
            disabled={disabled}
            className="rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/8 hover:text-foreground disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input row */}
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={disabled ? "UrbanPulse AI is responding…" : "Ask about traffic, hotspots, scenarios…"}
          disabled={disabled}
          className="flex-1 rounded-md border border-border bg-input px-3.5 py-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Voice input (placeholder)"
          disabled
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card/40 text-muted-foreground/50"
          title="Voice input — placeholder"
        >
          <Mic className="size-3.5" strokeWidth={2} />
        </button>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md transition-colors",
            disabled || !value.trim()
              ? "bg-muted text-muted-foreground/40"
              : "bg-primary text-primary-foreground hover:bg-primary/85"
          )}
          aria-label="Send message"
        >
          {disabled ? <Square className="size-3" strokeWidth={2.5} /> : <Send className="size-3.5" strokeWidth={2} />}
        </button>
      </form>
    </div>
  );
}
