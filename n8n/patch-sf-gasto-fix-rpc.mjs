/**
 * Arregla el nodo "Descontar saldo cuenta" del SF Gasto (OcPG64aOIccaaEZW):
 * - URL absoluta vía $env.SUPABASE_URL (con fallback a un placeholder).
 * - Auth: usa la credencial nativa Supabase (predefinedCredentialType).
 * - Headers correctos (Content-Type + Prefer return=representation).
 * - Body JSON con p_cuenta y p_monto desde "Preparar movimiento".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = { ...loadEnv(path.join(root, ".env")), ...loadEnv(path.join(root, ".env.local")) };
const base = (env.N8N_API_URL || "").replace(/\/$/, "");
const key = env.N8N_API_KEY;
if (!base || !key) throw new Error("Faltan N8N_API_URL y N8N_API_KEY en .env");

const SF_GASTO_ID = "OcPG64aOIccaaEZW";
const NAME_DESCONTAR = "Descontar saldo cuenta";
const SUPABASE_CRED_ID = "ba4qEQrLnOrIpzDf";
const SUPABASE_CRED_NAME = "Indovina Supabase API";

async function api(method, url, body) {
  const opts = {
    method,
    headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

const wfUrl = `${base}/api/v1/workflows/${SF_GASTO_ID}`;
const wf = await api("GET", wfUrl);

const node = wf.nodes.find((n) => n.name === NAME_DESCONTAR);
if (!node) throw new Error(`No encontré "${NAME_DESCONTAR}" en SF Gasto.`);

node.type = "n8n-nodes-base.httpRequest";
node.typeVersion = 4.4;
node.parameters = {
  method: "POST",
  url: "={{ $env.SUPABASE_URL }}/rest/v1/rpc/descontar_saldo",
  authentication: "predefinedCredentialType",
  nodeCredentialType: "supabaseApi",
  sendHeaders: true,
  headerParameters: {
    parameters: [
      { name: "Content-Type", value: "application/json" },
      { name: "Prefer", value: "return=representation" },
    ],
  },
  sendBody: true,
  contentType: "json",
  specifyBody: "json",
  jsonBody:
    "={{ JSON.stringify({ p_cuenta: $('Preparar movimiento').item.json.cuenta, p_monto: Math.abs($('Preparar movimiento').item.json.monto) }) }}",
  options: {},
};
node.credentials = {
  supabaseApi: { id: SUPABASE_CRED_ID, name: SUPABASE_CRED_NAME },
};

const putBody = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
};

const updated = await api("PUT", wfUrl, putBody);
console.log("OK SF Gasto / Descontar saldo arreglado:", updated.id);
