/**
 * Setea explícitamente authentication: 'serviceAccount' en todos los nodos
 * Mirror Sheets. Sin esto el nodo busca cred googleSheetsOAuth2Api y rechaza
 * la cred googleApi (Service Account) que tenemos.
 */
import fs from "node:fs";
const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const base = env.N8N_API_URL.replace(/\/$/, "");
const key = env.N8N_API_KEY;

async function api(method, url, body) {
  const opts = { method, headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

const TARGETS = ["OcPG64aOIccaaEZW", "iOAvoQaSdY7OmNHt", "CFovQKG2RvJ7OEFB", "nT0MGKF7URJySwZM"];

for (const id of TARGETS) {
  const wfUrl = `${base}/api/v1/workflows/${id}`;
  const wf = await api("GET", wfUrl);
  let dirty = false;
  for (const n of wf.nodes) {
    if (n.type === "n8n-nodes-base.googleSheets") {
      n.parameters = { ...(n.parameters || {}), authentication: "serviceAccount" };
      dirty = true;
      console.log(`  • ${wf.name} / ${n.name}: authentication=serviceAccount`);
    }
  }
  if (dirty) {
    await api("PUT", wfUrl, {
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings || {},
      staticData: wf.staticData ?? null,
    });
  }
}
console.log("Done.");
