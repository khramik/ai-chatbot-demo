// The chatbot server: serves the demo site + widget and answers chat messages.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { validateChatBody } from "./lib/validate.js";
import { saveLead } from "./lib/leads.js";
import { demoReply } from "./lib/demo.js";
import { createAI } from "./lib/ai.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const DATA_DIR = path.join(here, "data");

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || "";
const MODEL = process.env.MODEL || "claude-opus-5-5";
const EFFORT = process.env.EFFORT || "low";
const WEBHOOK = process.env.LEAD_WEBHOOK_URL || "";
const WEBHOOK_SECRET = process.env.LEAD_WEBHOOK_SECRET || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE) || 20;

const knowledge = await fs.readFile(path.join(here, "business.md"), "utf8");
const ai = API_KEY ? createAI({ apiKey: API_KEY, model: MODEL, effort: EFFORT, knowledge }) : null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// --- simple per-IP rate limit (protects the AI bill from spam) ---
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (list.every((t) => now - t >= 60_000)) hits.delete(ip);
}, 60_000).unref();

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
  }
}

async function readJson(req, limit = 32_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}

async function handleChat(req, res) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Too many messages. Please wait a minute." }));
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "Bad request" }));
    return;
  }
  const check = validateChatBody(body);
  if (!check.ok) {
    res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: check.error }));
    return;
  }

  // Stream the answer as newline-delimited JSON events.
  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" });
  const send = (event) => res.write(JSON.stringify(event) + "\n");
  const onLead = async (lead) => {
    await saveLead(lead, { dataDir: DATA_DIR, webhookUrl: WEBHOOK, webhookSecret: WEBHOOK_SECRET });
    send({ type: "lead_saved" });
  };

  if (!ai) {
    const { text, lead } = demoReply(check.messages);
    for (const word of text.split(/(?<=\s)/)) {
      send({ type: "text", text: word });
      await new Promise((r) => setTimeout(r, 25));
    }
    if (lead) await onLead(lead);
    send({ type: "done" });
    res.end();
    return;
  }

  const abort = new AbortController();
  res.on("close", () => abort.abort());
  try {
    const result = await ai.reply(check.messages, {
      onText: (text) => send({ type: "text", text }),
      onLead,
      signal: abort.signal,
    });
    if (result.refused) {
      send({ type: "text", text: "Sorry, I can't help with that here. Is there anything else about our services I can help with?" });
    }
    send({ type: "done" });
  } catch (err) {
    if (abort.signal.aborted) return;
    if (err instanceof Anthropic.AuthenticationError) console.error("AI key is invalid - check ANTHROPIC_API_KEY in .env");
    else if (err instanceof Anthropic.RateLimitError) console.error("AI rate limit hit");
    else if (err instanceof Anthropic.APIError) console.error(`AI error ${err.status}:`, err.message);
    else console.error("Chat error:", err);
    send({ type: "error", text: "Sorry, something went wrong. Please try again or call us." });
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const { pathname } = new URL(req.url, "http://x");
  if (pathname === "/api/chat" && req.method === "POST") return handleChat(req, res);
  if (pathname === "/api/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, mode: ai ? "ai" : "demo" }));
  }
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, () => {
  console.log(`Chatbot running: http://localhost:${PORT}  (mode: ${ai ? `AI, ${MODEL}` : "demo, no API key"})`);
});
