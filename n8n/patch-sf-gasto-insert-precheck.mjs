/**
 * Reescribe "Insert movimientos Supabase" con un pre-check de la columna `forma`
 * antes de cada insert. Si la columna existe → la incluye. Si no → la omite.
 * Evita depender de la estructura del error de Axios (que envuelve el body PGRST204).
 *
 * Sin migration 009: forma NO se guarda en movimientos (pero el bot funciona).
 * Con migration 009: forma SÍ se guarda.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = loadEnv(path.join(root, ".env"));
const URL = env.N8N_API_URL.replace(/\/$/, "");
const KEY = env.N8N_API_KEY;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SF_GASTO_ID = "OcPG64aOIccaaEZW";

const INSERT_CODE = `const SUPABASE_URL = $env.SUPABASE_URL || "${SUPABASE_URL}";
const SUPABASE_KEY = $env.SUPABASE_SERVICE_ROLE_KEY || "${SUPABASE_KEY}";
const prep = $('Preparar movimiento').item.json;

const baseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};

// 1) Pre-check: ¿existe la columna 'forma' en movimientos?
let formaExists = false;
try {
  const probe = await this.helpers.httpRequest({
    method: 'GET',
    url: SUPABASE_URL + '/rest/v1/movimientos?select=forma&limit=1',
    headers: baseHeaders,
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  });
  formaExists = probe.statusCode === 200;
} catch (e) {
  formaExists = false;
}

// 2) Armar payload sin/con forma según pre-check.
const payload = {
  fecha: prep.fecha,
  monto: prep.monto,
  proveedor: prep.proveedor,
  categoria: prep.categoria,
  comentario: prep.comentario,
  tipo_comprobante: prep.tipo_comprobante || '',
  numero_comprobante: prep.numero_comprobante || '',
  fecha_vencimiento: prep.fecha_vencimiento || '',
  origen: prep.origen || 'n8n',
  cuenta: prep.cuenta,
};
if (formaExists && prep.forma) payload.forma = prep.forma;

// 3) Insert.
const res = await this.helpers.httpRequest({
  method: 'POST',
  url: SUPABASE_URL + '/rest/v1/movimientos',
  headers: { ...baseHeaders, Prefer: 'return=representation' },
  body: payload,
  json: true,
  returnFullResponse: true,
  ignoreHttpStatusErrors: true,
});

if (res.statusCode < 200 || res.statusCode >= 300) {
  const bodyStr = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
  throw new Error('Insert movimientos falló ' + res.statusCode + ': ' + bodyStr);
}

const row = Array.isArray(res.body) ? res.body[0] : res.body;
return [{ json: row }];`;

async function api(method, p, body) {
  const r = await fetch(`${URL}/api/v1${p}`, {
    method,
    headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t.slice(0, 500)}`);
  return t ? JSON.parse(t) : null;
}

async function main() {
  const wf = await api("GET", `/workflows/${SF_GASTO_ID}`);
  const node = wf.nodes.find((n) => n.name === "Insert movimientos Supabase");
  if (!node) throw new Error("Nodo no encontrado");
  node.type = "n8n-nodes-base.code";
  node.typeVersion = 2;
  node.parameters = { jsCode: INSERT_CODE, mode: "runOnceForAllItems", language: "javaScript" };
  // Quitar credentials viejas del nodo Supabase (ya no aplican al Code node).
  delete node.credentials;

  await api("PUT", `/workflows/${SF_GASTO_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" }, staticData: wf.staticData ?? null,
  });
  console.log("[OK] SF Gasto: insert con pre-check de columna forma.");
}
main().catch((e) => { console.error(e); process.exit(1); });
