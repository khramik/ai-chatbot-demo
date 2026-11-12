// Saves a lead (a potential customer's contact) to data/leads.json
// and, if LEAD_WEBHOOK_URL is set, sends it to an automation (n8n / Make / Zapier).
import fs from "node:fs/promises";
import path from "node:path";

export async function saveLead(lead, { dataDir, webhookUrl, webhookSecret, source = "website chat" } = {}) {
  const record = { ...lead, source, created_at: new Date().toISOString() };

  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, "leads.json");
  let list = [];
  try {
    list = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  list.push(record);
  await fs.writeFile(file, JSON.stringify(list, null, 2));

  if (webhookUrl) {
    // Fire and forget: the visitor's chat never waits for the automation.
    const headers = { "content-type": "application/json" };
    if (webhookSecret) headers["x-webhook-secret"] = webhookSecret;
    fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(10_000),
    })
      .then((res) => {
        if (!res.ok) console.error(`Lead webhook answered ${res.status}`);
      })
      .catch((err) => console.error("Lead webhook failed:", err.message));
  }
  return record;
}
