/*
 * AI chat widget — add to any website with one line:
 * <script src="https://YOUR-SERVER/widget.js" data-title="Brightside Dental" defer></script>
 *
 * Options (data-attributes on the script tag):
 *   data-title        header title
 *   data-subtitle     small text under the title
 *   data-color        brand color, e.g. #0f766e
 *   data-greeting     first message from the bot
 *   data-suggestions  quick buttons, separated by |
 *   data-launcher     text on the chat button (desktop), default "Ask us anything"
 *   data-endpoint     chat API URL (default: same server as this script)
 *
 * JavaScript API (after the "aichat:ready" event):
 *   AIChatWidget.open()  .close()  .ask("text")  .setColor("#123456")
 */
(() => {
  if (window.AIChatWidget) return;

  const script = document.currentScript;
  const ds = script?.dataset || {};
  const origin = script ? new URL(script.src).origin : location.origin;
  const isColor = (c) => /^#[0-9a-f]{3,8}$/i.test(c || "");
  const cfg = {
    endpoint: ds.endpoint || `${origin}/api/chat`,
    title: ds.title || "Chat with us",
    subtitle: ds.subtitle || "Usually replies in seconds",
    color: isColor(ds.color) ? ds.color : "#0f766e",
    greeting: ds.greeting || "Hi! 👋 How can I help you today?",
    launcher: ds.launcher || "Ask us anything",
    suggestions: (ds.suggestions || "").split("|").map((s) => s.trim()).filter(Boolean),
  };
  const STORE_KEY = "ai-chat-history:" + location.host;
  const store = {
    load() { try { return JSON.parse(sessionStorage.getItem(STORE_KEY)) || []; } catch { return []; } },
    save(list) { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-20))); } catch {} },
  };

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483000;inset:auto 0 0 auto;";
  host.style.setProperty("--brand", cfg.color);
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="2.6"/></svg>';

  root.innerHTML = `
<style>
  :host { --brand: #0f766e; --ink: #111; --muted: #6b7280; --line: #ececec; --bg: #f6f6f4; }
  * { box-sizing: border-box; font-family: inherit; }
  button { font: inherit; }
  .launcher {
    position: fixed; right: 22px; bottom: 22px; height: 58px; padding: 0 22px 0 18px; border-radius: 999px;
    border: 0; background: var(--brand); color: #fff; cursor: pointer; display: flex; align-items: center; gap: 10px;
    font-size: 15.5px; font-weight: 600; box-shadow: 0 10px 30px rgba(0,0,0,.25);
    transition: transform .2s ease, background .5s ease, opacity .2s ease;
  }
  .launcher:hover { transform: translateY(-2px); }
  .launcher svg { width: 24px; height: 24px; flex: none; }
  .launcher .pulse { position: absolute; inset: 0; border-radius: inherit; box-shadow: 0 0 0 0 var(--brand); animation: pulse 2.4s ease-out 3; pointer-events: none; opacity: .6; }
  @keyframes pulse { to { box-shadow: 0 0 0 16px transparent; } }
  .launcher.hidden { opacity: 0; pointer-events: none; transform: scale(.9); }
  :focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }

  .panel {
    position: fixed; right: 22px; bottom: 22px; width: 390px; height: min(640px, calc(100vh - 44px));
    background: #fff; color: var(--ink); border-radius: 24px; overflow: hidden;
    box-shadow: 0 24px 70px rgba(0,0,0,.28), 0 0 0 1px rgba(0,0,0,.04); display: flex; flex-direction: column;
    opacity: 0; transform: translateY(16px) scale(.97); transform-origin: bottom right; pointer-events: none;
    transition: opacity .22s ease, transform .22s cubic-bezier(.2,.8,.3,1);
  }
  .panel.open { opacity: 1; transform: none; pointer-events: auto; }
  header {
    position: relative; padding: 18px 16px 18px 18px; display: flex; align-items: center; gap: 12px; color: #fff;
    background: radial-gradient(120% 140% at 0% 0%, rgba(255,255,255,.22), transparent 55%), var(--brand);
    transition: background-color .5s ease;
  }
  .avatar { position: relative; width: 44px; height: 44px; border-radius: 14px; background: #fff; color: var(--brand); display: grid; place-items: center; font-weight: 800; font-size: 19px; flex: none; }
  .avatar::after { content: ""; position: absolute; right: -3px; bottom: -3px; width: 13px; height: 13px; border-radius: 50%; background: #22c55e; border: 2.5px solid var(--brand); }
  .titles { flex: 1; min-width: 0; }
  .title { font-weight: 700; font-size: 16.5px; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .subtitle { font-size: 12.5px; opacity: .85; margin-top: 1px; }
  .icon-btn { background: rgba(255,255,255,.14); border: 0; color: #fff; cursor: pointer; width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; transition: background .2s; flex: none; }
  .icon-btn:hover { background: rgba(255,255,255,.26); }

  .msgs { flex: 1; overflow-y: auto; padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 8px; background: var(--bg); overscroll-behavior: contain; }
  .day { align-self: center; font-size: 11.5px; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; margin-bottom: 4px; }
  .msg { max-width: 84%; padding: 11px 14px; border-radius: 18px; font-size: 15px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; animation: pop .22s ease both; }
  @keyframes pop { from { opacity: 0; transform: translateY(6px); } }
  .bot { background: #fff; align-self: flex-start; border-bottom-left-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.03); }
  .user { background: var(--brand); color: #fff; align-self: flex-end; border-bottom-right-radius: 6px; transition: background-color .5s ease; }
  .user + .bot, .bot + .user { margin-top: 6px; }
  .note { align-self: center; display: flex; align-items: center; gap: 6px; font-size: 13px; color: #166534; background: #dcfce7; border-radius: 999px; padding: 6px 13px; margin: 6px 0; animation: pop .25s ease both; }
  .err { background: #fef2f2; box-shadow: 0 0 0 1px #fecaca; }
  .typing { display: inline-flex; gap: 5px; padding: 15px 16px; }
  .typing span { width: 7px; height: 7px; border-radius: 50%; background: #a3a3a3; animation: blink 1.2s infinite; }
  .typing span:nth-child(2) { animation-delay: .2s; } .typing span:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

  .chips { display: flex; flex-wrap: wrap; gap: 7px; padding: 4px 16px 12px; background: var(--bg); }
  .chip { border: 1.5px solid var(--brand); color: var(--brand); background: #fff; border-radius: 999px; padding: 7px 14px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background .15s, color .15s; }
  .chip:hover { background: var(--brand); color: #fff; }

  form { padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); background: #fff; border-top: 1px solid var(--line); }
  .field { display: flex; align-items: flex-end; gap: 8px; background: var(--bg); border: 1.5px solid transparent; border-radius: 18px; padding: 5px 5px 5px 14px; transition: border-color .2s, background .2s; }
  .field:focus-within { border-color: var(--brand); background: #fff; }
  textarea:focus-visible { outline: none; }
  textarea { flex: 1; resize: none; border: 0; outline: none; background: transparent; padding: 9px 0; font-size: 16px; line-height: 1.35; max-height: 110px; color: var(--ink); }
  .send { width: 40px; height: 40px; border-radius: 14px; border: 0; background: var(--brand); color: #fff; cursor: pointer; display: grid; place-items: center; flex: none; transition: opacity .2s, transform .15s; }
  .send:active { transform: scale(.94); }
  .send:disabled { opacity: .35; cursor: default; }
  .footer { text-align: center; font-size: 11px; color: #a3a3a3; padding: 7px 0 0; }

  @media (max-width: 480px) {
    .launcher { right: 16px; bottom: 16px; width: 60px; height: 60px; padding: 0; justify-content: center; }
    .launcher .label { display: none; }
    .panel { inset: 0; width: 100%; height: 100%; height: 100dvh; border-radius: 0; transform-origin: bottom center; }
  }
  @media (prefers-reduced-motion: reduce) {
    .panel, .launcher, .msg, .note { transition: none; animation: none; }
    .typing span, .launcher .pulse { animation: none; }
  }
</style>
<button class="launcher" aria-label="Open chat" aria-expanded="false">${ICON_CHAT}<span class="label"></span><span class="pulse"></span></button>
<section class="panel" role="dialog" aria-label="Chat">
  <header>
    <div class="avatar" aria-hidden="true"></div>
    <div class="titles"><div class="title"></div><div class="subtitle"></div></div>
    <button class="icon-btn restart" aria-label="Start a new conversation" title="New conversation">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
    </button>
    <button class="icon-btn close" aria-label="Close chat">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </header>
  <div class="msgs" aria-live="polite"></div>
  <div class="chips"></div>
  <form>
    <div class="field">
      <textarea rows="1" placeholder="Type your message…" aria-label="Message" maxlength="1000"></textarea>
      <button class="send" type="submit" aria-label="Send">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>
    <div class="footer">AI assistant · can make mistakes</div>
  </form>
</section>`;

  const $ = (s) => root.querySelector(s);
  const launcher = $(".launcher"), panel = $(".panel"), msgs = $(".msgs"), chips = $(".chips");
  const form = $("form"), input = $("textarea"), sendBtn = $(".send");
  $(".title").textContent = cfg.title;
  $(".subtitle").textContent = cfg.subtitle;
  $(".avatar").textContent = cfg.title.trim().charAt(0).toUpperCase() || "?";
  $(".label").textContent = cfg.launcher;

  let history = store.load();
  let busy = false;

  const scrollDown = () => { msgs.scrollTop = msgs.scrollHeight; };
  function bubble(cls, text) {
    const el = document.createElement("div");
    el.className = "msg " + cls;
    el.textContent = text;
    msgs.appendChild(el);
    scrollDown();
    return el;
  }
  function note(text) {
    const el = document.createElement("div");
    el.className = "note";
    el.textContent = text;
    msgs.appendChild(el);
    scrollDown();
  }
  function renderChips() {
    chips.innerHTML = "";
    if (history.length > 0) return;
    for (const s of cfg.suggestions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = s;
      b.onclick = () => send(s);
      chips.appendChild(b);
    }
  }
  function render() {
    msgs.innerHTML = '<div class="day">Today</div>';
    bubble("bot", cfg.greeting);
    for (const m of history) bubble(m.role === "user" ? "user" : "bot", m.content);
    renderChips();
  }

  const isOpen = () => panel.classList.contains("open");
  function setOpen(open) {
    panel.classList.toggle("open", open);
    launcher.classList.toggle("hidden", open);
    launcher.setAttribute("aria-expanded", String(open));
    $(".pulse")?.remove();
    if (open) setTimeout(() => { scrollDown(); input.focus({ preventScroll: true }); }, 60);
    else launcher.focus({ preventScroll: true });
  }
  launcher.onclick = () => setOpen(true);
  $(".close").onclick = () => setOpen(false);
  $(".restart").onclick = () => {
    if (busy) return;
    history = [];
    store.save(history);
    render();
    input.focus();
  };
  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) setOpen(false); });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 110) + "px";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    input.style.height = "auto";
    chips.innerHTML = "";

    history.push({ role: "user", content: text });
    store.save(history);
    bubble("user", text);

    const typing = document.createElement("div");
    typing.className = "msg bot typing";
    typing.setAttribute("aria-label", "Assistant is typing");
    typing.innerHTML = "<span></span><span></span><span></span>";
    msgs.appendChild(typing);
    scrollDown();

    let botEl = null, answer = "", failed = false;
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Network error");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") {
            if (!botEl) { typing.remove(); botEl = bubble("bot", ""); }
            answer += ev.text;
            botEl.textContent = answer;
            scrollDown();
          } else if (ev.type === "lead_saved") {
            note("✓ Request sent to our team");
          } else if (ev.type === "error") {
            failed = true;
            typing.remove();
            bubble("bot err", ev.text);
          }
        }
      }
    } catch (err) {
      failed = true;
      typing.remove();
      bubble("bot err", err.message === "Network error" || err instanceof TypeError
        ? "Can't connect right now. Please try again in a moment."
        : err.message);
    }
    typing.remove();
    if (answer && !failed) history.push({ role: "assistant", content: answer });
    else if (!answer) history.pop(); // let the visitor resend
    store.save(history);
    busy = false;
    sendBtn.disabled = false;
    if (isOpen()) input.focus({ preventScroll: true });
  }

  render();

  window.AIChatWidget = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    ask: (text) => { setOpen(true); send(String(text || "")); },
    setColor: (c) => { if (isColor(c)) host.style.setProperty("--brand", c); },
  };
  window.dispatchEvent(new Event("aichat:ready"));
})();
