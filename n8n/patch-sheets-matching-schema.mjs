/**
 * Agrega matchingColumns:[] y schema:[...] a los nodos Mirror Sheets.
 * Sin esto, googleSheets v4.7 con mappingMode:defineBelow falla con
 * "Could not get parameter".
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

function buildSchema(value) {
  return Object.keys(value).map((name) => ({
    id: name,
    displayName: name,
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
    removed: false,
  }));
}

const TARGETS = ["OcPG64aOIccaaEZW", "iOAvoQaSdY7OmNHt", "CFovQKG2RvJ7OEFB", "nT0MGKF7URJySwZM"];

for (const id of TARGETS) {
  const wfUrl = `${base}/api/v1/workflows/${id}`;
  const wf = await api("GET", wfUrl);
  let dirty = false;
  for (const n of wf.nodes) {
    if (n.type !== "n8n-nodes-base.googleSheets") continue;
    const cols = n.parameters?.columns || {};
    const value = cols.value || {};
    const schema = buildSchema(value);
    n.parameters.columns = {
      mappingMode: "defineBelow",
      value,
      matchingColumns: [],
      schema,
      attemptToConvertTypes: false,
      convertFieldsToString: true,
    };
    console.log(`  • ${wf.name} / ${n.name}: schema con ${schema.length} columnas`);
    dirty = true;
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
