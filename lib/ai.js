// Talks to Claude (the AI "brain") and lets it save leads through a tool.
import Anthropic from "@anthropic-ai/sdk";
import { validateLead } from "./validate.js";

const SAVE_LEAD_TOOL = {
  name: "save_lead",
  description:
    "Save a visitor's booking or callback request so the business can call them back. " +
    "Call it only after the visitor has given at least their name and phone number.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Visitor's name" },
      phone: { type: "string", description: "Visitor's phone number, as given" },
      preferred_time: { type: "string", description: "Preferred day/time, or empty string if not given" },
      reason: { type: "string", description: "Reason for the visit or request, or empty string" },
    },
    required: ["name", "phone", "preferred_time", "reason"],
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
};

const INSTRUCTIONS = `You are the friendly chat assistant on a small business website.
Latency-sensitive; begin your visible answer immediately.

Rules:
- Answer only from the knowledge base below. If something isn't there, say you're not sure and offer a callback from the team. Never invent prices, times or policies.
- Reply in the visitor's language. Keep answers short (1-4 sentences), warm and plain. Plain text only: no markdown headings, bold or tables; simple "•" lists are fine.
- Your goal is to help, and when it fits, to turn the chat into a booking or callback request: collect name, phone number, preferred day/time and reason, then call save_lead. After saving, confirm and say when the team will get back to them.
- No medical diagnoses. For severe pain, swelling or bleeding suggest an emergency visit; for life-threatening situations tell them to call emergency services.
- Stay on topic. Politely decline unrelated tasks.

Knowledge base:
`;

/** After a mid-output safety fallback, drop model-internal blocks that came before the last fallback marker. */
function echoable(content) {
  const lastFallback = content.map((b) => b.type).lastIndexOf("fallback");
  if (lastFallback === -1) return content;
  const internal = new Set(["thinking", "redacted_thinking", "tool_use"]);
  return content.filter((b, i) => i > lastFallback || (b.type !== "fallback" && !internal.has(b.type)));
}

export function createAI({ apiKey, model, effort, knowledge }) {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  const system = [{ type: "text", text: INSTRUCTIONS + knowledge, cache_control: { type: "ephemeral" } }];

  /**
   * Streams a reply. onText(delta) gets text pieces as they arrive;
   * onLead(lead) is called when the AI saves a booking request.
   */
  async function reply(messages, { onText, onLead, signal }) {
    const convo = [...messages];
    for (let turn = 0; turn < 3; turn++) {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: 8000, // cost cap for a public widget
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort },
          system,
          tools: [SAVE_LEAD_TOOL],
          messages: convo,
        },
        { signal },
      );
      stream.on("text", onText);
      const msg = await stream.finalMessage();

      if (msg.stop_reason === "refusal") return { refused: true };
      if (msg.stop_reason !== "tool_use") return { refused: false };

      const content = echoable(msg.content);
      const toolUses = content.filter((b) => b.type === "tool_use");
      if (toolUses.length === 0) return { refused: false };
      convo.push({ role: "assistant", content });

      const results = [];
      for (const tu of toolUses) {
        const lead = tu.name === "save_lead" ? validateLead(tu.input) : null;
        if (!lead) {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            is_error: true,
            content: "Not saved: a name and a valid phone number are required. Ask the visitor for them.",
          });
          continue;
        }
        await onLead(lead);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: "Saved. The front desk will call the visitor back during business hours.",
        });
      }
      convo.push({ role: "user", content: results });
    }
    return { refused: false };
  }

  return { reply };
}
