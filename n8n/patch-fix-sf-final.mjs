/**
 * Triple fix final basado en pruebas E2E reales:
 *
 * 1) SF Gasto / Descontar saldo cuenta (Code):
 *    - Leía $input.first().json.cuenta, pero el Insert anterior tira la columna 'cuenta'
 *      (no es columna de movimientos). Leer desde $('Preparar movimiento').item.json.cuenta.
 *
 * 2) SF Cheque / Preparar fila (Code):
 *    - Retornaba foto_url:'' que no existe en tabla cheques. Borrarlo del return.
 *
 * 3) Reasignar cred Google nueva (IR5D8tfAlpwgHXkz) en TODOS los Mirror Sheets.
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
const ref = JSON.parse(Buffer.from(SR.split(".")[1], "base64").toString()).ref;
const SUPABASE_URL = `https://${ref}.supabase.co`;

const NEW_GOOGLE_CRED_ID = "IR5D8tfAlpwgHXkz";
const NEW_GOOGLE_CRED_NAME = "Indovina Google Service Account";

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

// ── Fix 1: SF Gasto / Descontar saldo cuenta (Code) ─────────────────────────
{
  const wfId = "OcPG64aOIccaaEZW";
  const wfUrl = `${base}/api/v1/workflows/${wfId}`;
  const wf = await api("GET", wfUrl);
  const node = wf.nodes.find((n) => n.name === "Descontar saldo cuenta");
  if (!node) throw new Error("No 'Descontar saldo cuenta' en SF Gasto.");

  const NEW_CODE = `
const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
const SUPABASE_KEY = ${JSON.stringify(SR)};

const prep = $('Preparar movimiento').item.json;
const cuenta = prep.cuenta;
const monto = Math.abs(Number(prep._monto_positivo || prep.monto || 0));
if (!cuenta) throw new Error('Falta cuenta para descontar saldo.');
if (!monto) throw new Error('Falta monto para descontar saldo.');

const enc = encodeURIComponent(cuenta);
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const getRes = await fetch(SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc + '&select=saldo', { headers });
if (!getRes.ok) throw new Error('GET cuentas ' + getRes.status + ': ' + (await getRes.text()).slice(0,200));
const rows = await getRes.json();
if (!rows.length) throw new Error('Cuenta no existe: ' + cuenta);
const saldoActual = Number(rows[0].saldo) || 0;
const saldoNuevo = saldoActual - monto;

const patchRes = await fetch(SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ saldo: saldoNuevo }),
});
if (!patchRes.ok) throw new Error('PATCH cuentas ' + patchRes.status + ': ' + (await patchRes.text()).slice(0,200));

return [{ json: { saldo: saldoNuevo, saldo_anterior: saldoActual, cuenta, monto } }];
`.trim();

  node.parameters = { ...(node.parameters || {}), jsCode: NEW_CODE };

  // También fix Mirror Sheets cred.
  for (const n of wf.nodes) {
    if (n.type === "n8n-nodes-base.googleSheets") {
      n.credentials = { googleApi: { id: NEW_GOOGLE_CRED_ID, name: NEW_GOOGLE_CRED_NAME } };
    }
  }

  await api("PUT", wfUrl, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("✓ SF Gasto: Descontar saldo refactor + Sheets cred reasignada.");
}

// ── Fix 2: SF Cheque / Preparar fila + Sheets cred ───────────────────────────
{
  const wfId = "iOAvoQaSdY7OmNHt";
  const wfUrl = `${base}/api/v1/workflows/${wfId}`;
  const wf = await api("GET", wfUrl);
  const prep = wf.nodes.find((n) => n.name === "Preparar fila");
  if (prep) {
    let code = String(prep.parameters?.jsCode || "");
    code = code.replace(/\s*foto_url:\s*['"]['"],?\s*/g, "");
    prep.parameters = { ...(prep.parameters || {}), jsCode: code };
  }
  for (const n of wf.nodes) {
    if (n.type === "n8n-nodes-base.googleSheets") {
      n.credentials = { googleApi: { id: NEW_GOOGLE_CRED_ID, name: NEW_GOOGLE_CRED_NAME } };
    }
  }
  await api("PUT", wfUrl, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("✓ SF Cheque: foto_url quitado + Sheets cred reasignada.");
}

// ── Fix 3: SF Factura proveedor + SF Foto: Sheets cred ───────────────────────
for (const wfId of ["CFovQKG2RvJ7OEFB", "nT0MGKF7URJySwZM"]) {
  const wfUrl = `${base}/api/v1/workflows/${wfId}`;
  const wf = await api("GET", wfUrl);
  let dirty = false;
  for (const n of wf.nodes) {
    if (n.type === "n8n-nodes-base.googleSheets") {
      n.credentials = { googleApi: { id: NEW_GOOGLE_CRED_ID, name: NEW_GOOGLE_CRED_NAME } };
      dirty = true;
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
    console.log(`✓ ${wf.name}: Sheets cred reasignada.`);
  }
}
