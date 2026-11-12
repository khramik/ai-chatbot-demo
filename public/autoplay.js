// Demo autoplay for screen recordings: open the site with ?autoplay and a
// "visitor" types two messages into the chat, waiting for each AI answer.
// Loaded only when the URL contains ?autoplay — never on a normal visit.
(() => {
  const SCRIPT = [
    "Hi! How much is a cleaning, and are you open on Saturday?",
    "Great, please book me in. I'm Emma Fischer, 0172 4455 6677, Saturday morning works best.",
  ];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run(widget) {
    try { sessionStorage.clear(); } catch {}
    const host = [...document.body.children].find((el) => el.shadowRoot);
    const root = host.shadowRoot;
    const input = root.querySelector("textarea");
    const isBusy = () => !!root.querySelector(".typing") || root.querySelector("button[type=submit]")?.disabled;

    await sleep(1800);
    root.querySelector(".restart")?.click();
    widget.open();
    await sleep(1200);

    for (const text of SCRIPT) {
      input.focus();
      for (const ch of text) {
        input.value += ch;
        input.dispatchEvent(new Event("input"));
        await sleep(ch === " " ? 55 : 38);
      }
      await sleep(500);
      widget.ask(input.value);
      await sleep(800);
      // Wait until the answer has finished streaming.
      let last = "", stable = 0;
      for (let i = 0; i < 120 && stable < 3; i++) {
        await sleep(500);
        const now = root.querySelector(".msgs").innerText;
        stable = !isBusy() && now === last ? stable + 1 : 0;
        last = now;
      }
      await sleep(2500);
    }
  }

  if (window.AIChatWidget) run(window.AIChatWidget);
  else addEventListener("aichat:ready", () => run(window.AIChatWidget), { once: true });
})();
