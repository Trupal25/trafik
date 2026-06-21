import { PendingPage } from "@/components/common/pending-page";

export default function CopilotPage() {
  return (
    <PendingPage
      eyebrow="06 / Natural Language"
      title="AI Copilot"
      description="Ask any traffic question in plain English. Groq + Llama 3 returns either a conversational answer or a structured intelligence card, grounded in the live dashboard, hotspot, and simulation endpoints via tool-calling."
      wave="Wave B"
      topology="chat"
    />
  );
}
