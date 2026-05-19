/**
 * Reemplaza fetch() por $helpers.httpRequest() en el Code "Descontar saldo cuenta"
 * del SF Gasto. El runtime de n8n no tiene fetch global.
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
const env = { ...loadEnv(path.join(root, ".env")) };
const base = env.N8N_API_URL.replace(/\/$/, "");
const key = env.N8N_API_KEY;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
const ref = JSON.parse(Buffer.from(SR.split(".")[1], "base64").toString()).ref;
const SUPABASE_URL = `https://${ref}.supabase.co`;

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

const wfId = "OcPG64aOIccaaEZW";
const wfUrl = `${base}/api/v1/workflows/${wfId}`;
const wf = await api("GET", wfUrl);
const node = wf.nodes.find((n) => n.name === "Descontar saldo cuenta");
if (!node) throw new Error("No 'Descontar saldo cuenta'.");

const NEW_CODE = `
const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
const SUPABASE_KEY = ${JSON.stringify(SR)};

const prep = $('Preparar movimiento').item.json;
const cuenta = prep.cuenta;
const monto = Math.abs(Number(prep._monto_positivo || prep.monto || 0));
if (!cuenta) throw new Error('Falta cuenta para descontar saldo.');
if (!monto) throw new Error('Falta monto para descontar saldo.');

const enc = encodeURIComponent(cuenta);
const baseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};

// 1) GET saldo actual.
const rows = await this.helpers.httpRequest({
  method: 'GET',
  url: SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc + '&select=saldo',
  headers: baseHeaders,
  json: true,
});
if (!Array.isArray(rows) || rows.length === 0) throw new Error('Cuenta no existe: ' + cuenta);
const saldoActual = Number(rows[0].saldo) || 0;
const saldoNuevo = saldoActual - monto;

// 2) PATCH saldo nuevo.
await this.helpers.httpRequest({
  method: 'PATCH',
  url: SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc,
  headers: { ...baseHeaders, Prefer: 'return=minimal' },
  body: { saldo: saldoNuevo },
  json: true,
});

return [{ json: { saldo: saldoNuevo, saldo_anterior: saldoActual, cuenta, monto } }];
`.trim();

node.parameters = { ...(node.parameters || {}), jsCode: NEW_CODE };

await api("PUT", wfUrl, {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
});
console.log("✓ SF Gasto: Descontar saldo refactor a $helpers.httpRequest.");
