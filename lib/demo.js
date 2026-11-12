// Demo mode: works without an AI key, using simple keyword answers.
// Lets anyone see the widget before the real AI is connected.

const ANSWERS = [
  { keys: ["price", "cost", "how much", "cleaning", "whitening"], text:
    "Here are some of our prices:\n• Check-up + X-rays — $95\n• Professional cleaning — $120\n• Whitening — $390\n• Filling — from $150\nWould you like to book a visit?" },
  { keys: ["hour", "open", "close", "when"], text:
    "We're open Mon–Fri 8:00–18:00 and Sat 9:00–14:00. Sunday we're closed." },
  { keys: ["where", "address", "location", "parking"], text:
    "We're at 214 Harbor Street, Maplewood. Free parking is right behind the building." },
  { keys: ["insurance"], text:
    "We accept most major dental insurance plans. Our front desk checks your exact coverage before the visit." },
  { keys: ["pain", "emergency", "hurt", "broken"], text:
    "I'm sorry you're in pain! We offer same-day emergency visits ($140). Share your name and phone number and we'll call you back right away." },
  { keys: ["book", "appointment", "visit", "schedule"], text:
    "Happy to help you book! Please send your name, phone number and a preferred day/time." },
];

const FALLBACK =
  "I can help with prices, opening hours, location, insurance and booking. What would you like to know?";

const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/;

/** Returns { text, lead } for the last user message. */
export function demoReply(messages) {
  const last = messages[messages.length - 1].content;
  const phone = last.match(PHONE_RE);
  if (phone) {
    const name = last.replace(PHONE_RE, "").replace(/[,.;:]/g, " ").trim().split(/\s+/).slice(0, 3).join(" ") || "Visitor";
    return {
      text: `Thank you, ${name}! I've passed your request to our front desk — they'll call you at ${phone[1].trim()} during business hours to confirm a time.`,
      lead: { name, phone: phone[1].trim(), preferred_time: "", reason: "(demo mode)" },
    };
  }
  const lower = last.toLowerCase();
  const hit = ANSWERS.find((a) => a.keys.some((k) => lower.includes(k)));
  return { text: (hit ?? { text: FALLBACK }).text, lead: null };
}
