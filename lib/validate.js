// Checks what the browser sends us before we pass it to the AI.
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_HISTORY = 20;

/**
 * Validates a chat request body: { messages: [{ role, content }] }.
 * Returns { ok: true, messages } or { ok: false, error }.
 */
export function validateChatBody(body) {
  if (!body || !Array.isArray(body.messages)) {
    return { ok: false, error: "messages must be an array" };
  }
  const messages = body.messages.slice(-MAX_HISTORY);
  if (messages.length === 0) return { ok: false, error: "messages is empty" };

  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) {
      return { ok: false, error: "invalid role" };
    }
    if (typeof m.content !== "string" || m.content.trim() === "") {
      return { ok: false, error: "invalid content" };
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return { ok: false, error: `message longer than ${MAX_MESSAGE_CHARS} characters` };
    }
    clean.push({ role: m.role, content: m.content.trim() });
  }
  // The conversation must start with the visitor and end with the visitor.
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (clean.length === 0 || clean[clean.length - 1].role !== "user") {
    return { ok: false, error: "last message must be from the user" };
  }
  return { ok: true, messages: clean };
}

/** Validates the save_lead tool input from the model. */
export function validateLead(input) {
  if (!input || typeof input !== "object") return null;
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const lead = {
    name: str(input.name, 100),
    phone: str(input.phone, 40),
    preferred_time: str(input.preferred_time, 200),
    reason: str(input.reason, 500),
  };
  if (!lead.name || !/\d{5,}/.test(lead.phone.replace(/\D/g, ""))) return null;
  return lead;
}
