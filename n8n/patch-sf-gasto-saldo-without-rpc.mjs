/**
 * Refactoriza el SF Gasto para que no dependa de la función RPC `descontar_saldo`
 * (que requiere aplicar la migración 004 manualmente en Supabase SQL Editor).
 *
 * Reemplaza el nodo HTTP "Descontar saldo cuenta" por un Code node que hace
 * GET + PATCH directos a la tabla `cuentas` vía Supabase REST con la
 * service-role embebida (leída del .env).
 *
 * Mismo IO contract: deja $('Descontar saldo cuenta').item.json con la nueva fila.
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
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key || !SR) throw new Error("Faltan N8N_API_URL/N8N_API_KEY/SUPABASE_SERVICE_ROLE_KEY en .env");
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

const SF_GASTO_ID = "OcPG64aOIccaaEZW";
const wfUrl = `${base}/api/v1/workflows/${SF_GASTO_ID}`;
const wf = await api("GET", wfUrl);

const node = wf.nodes.find((n) => n.name === "Descontar saldo cuenta");
if (!node) throw new Error("No encontré 'Descontar saldo cuenta' en SF Gasto.");

const CODE = `
const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
const SUPABASE_KEY = ${JSON.stringify(SR)};

const item = $input.first();
const cuenta = item.json.cuenta;
const monto = Math.abs(Number(item.json.monto || 0));
if (!cuenta) throw new Error('Falta cuenta para descontar saldo.');
if (!monto) throw new Error('Falta monto para descontar saldo.');

const enc = encodeURIComponent(cuenta);
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

// 1) Leer saldo actual.
const getRes = await fetch(SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc + '&select=saldo', { headers });
if (!getRes.ok) throw new Error('GET cuentas ' + getRes.status + ': ' + (await getRes.text()).slice(0,200));
const rows = await getRes.json();
if (!rows.length) throw new Error('Cuenta no existe: ' + cuenta);
const saldoActual = Number(rows[0].saldo) || 0;
const saldoNuevo = saldoActual - monto;

// 2) Patch saldo nuevo.
const patchRes = await fetch(SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ saldo: saldoNuevo }),
});
if (!patchRes.ok) throw new Error('PATCH cuentas ' + patchRes.status + ': ' + (await patchRes.text()).slice(0,200));
const patched = await patchRes.json();

return [{ json: { saldo: saldoNuevo, saldo_anterior: saldoActual, cuenta, monto, patched } }];
`.trim();

node.type = "n8n-nodes-base.code";
node.typeVersion = 2;
node.parameters = {
  mode: "runOnceForAllItems",
  language: "javaScript",
  jsCode: CODE,
};
delete node.credentials;

await api("PUT", wfUrl, {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
});
console.log("OK SF Gasto: 'Descontar saldo cuenta' refactor a Code (GET+PATCH directo, sin RPC).");
