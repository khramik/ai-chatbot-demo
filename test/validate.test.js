import { test } from "node:test";
import assert from "node:assert/strict";
import { validateChatBody, validateLead, MAX_MESSAGE_CHARS } from "../lib/validate.js";
import { demoReply } from "../lib/demo.js";

test("accepts a normal conversation", () => {
  const r = validateChatBody({ messages: [{ role: "user", content: " hi " }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.messages, [{ role: "user", content: "hi" }]);
});

test("rejects bad roles, empty and too long messages", () => {
  assert.equal(validateChatBody({ messages: [{ role: "system", content: "x" }] }).ok, false);
  assert.equal(validateChatBody({ messages: [{ role: "user", content: "  " }] }).ok, false);
  assert.equal(validateChatBody({ messages: [{ role: "user", content: "a".repeat(MAX_MESSAGE_CHARS + 1) }] }).ok, false);
  assert.equal(validateChatBody({}).ok, false);
});

test("last message must be from the user; leading assistant messages are dropped", () => {
  assert.equal(validateChatBody({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }).ok, false);
  const r = validateChatBody({ messages: [{ role: "assistant", content: "hello" }, { role: "user", content: "q" }] });
  assert.deepEqual(r.messages, [{ role: "user", content: "q" }]);
});

test("keeps only the last 20 messages", () => {
  const messages = Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: String(i) }));
  const r = validateChatBody({ messages });
  assert.equal(r.ok, true);
  assert.ok(r.messages.length <= 20);
  assert.equal(r.messages.at(-1).content, "30");
});

test("lead needs a name and a real phone number", () => {
  assert.equal(validateLead({ name: "Anna", phone: "12" }), null);
  assert.equal(validateLead({ name: "", phone: "+1 555 014 2290" }), null);
  assert.equal(validateLead({ name: "Anna", phone: "+1 555 014 2290", preferred_time: "", reason: "" }).name, "Anna");
});

test("demo mode answers prices and captures a phone number", () => {
  assert.match(demoReply([{ role: "user", content: "How much is a cleaning?" }]).text, /\$120/);
  const r = demoReply([{ role: "user", content: "Anna Miller, +1 555 014 2290" }]);
  assert.equal(r.lead.phone, "+1 555 014 2290");
  assert.match(r.text, /Anna Miller/);
});
