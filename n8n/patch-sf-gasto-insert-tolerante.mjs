/**
 * Reemplaza el nodo "Insert movimientos Supabase" (autoMap) por un Code node
 * que hace el insert directo vía REST con FALLBACK: si la columna `forma`
 * todavía no existe (migration 009 no aplicada), reintenta sin forma.
 *
 * Esto permite que el bot funcione AHORA aunque migration 009 no esté
 * corrida. Cuando se aplique, `forma` se guarda automáticamente.
 *
 * Uso: node n8n/patch-sf-gasto-insert-tolerante.mjs
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
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

function buildPayload(includeForma) {
  const p = {
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
  if (includeForma && prep.forma) p.forma = prep.forma;
  return p;
}

async function tryInsert(payload) {
  return await this.helpers.httpRequest({
    method: 'POST',
    url: SUPABASE_URL + '/rest/v1/movimientos',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: payload,
    json: true,
    returnFullResponse: false,
  });
}

let result;
try {
  result = await tryInsert.call(this, buildPayload(true));
} catch (e) {
  const msg = String(e?.message || '');
  const bodyRaw = e?.response?.body ?? e?.cause?.response?.body;
  const bodyStr = typeof bodyRaw === 'string' ? bodyRaw : JSON.stringify(bodyRaw ?? {});
  const dump = (() => { try { return JSON.stringify(e, Object.getOwnPropertyNames(e)); } catch { return ''; } })();
  const all = (msg + ' ' + bodyStr + ' ' + dump).toLowerCase();
  if (all.includes("'forma'") || all.includes('"forma"') || all.includes('pgrst204') || all.includes('column "forma"') || all.includes('forma')) {
    // Fallback: la columna forma todavía no existe (migration 009 pendiente).
    result = await tryInsert.call(this, buildPayload(false));
  } else {
    throw e;
  }
}

const row = Array.isArray(result) ? result[0] : result;
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
  const oldNode = wf.nodes.find((n) => n.name === "Insert movimientos Supabase");
  if (!oldNode) throw new Error("Nodo 'Insert movimientos Supabase' no encontrado");

  // Reemplazar el nodo por uno Code con la misma posición y nombre.
  const newNode = {
    id: oldNode.id,
    name: "Insert movimientos Supabase",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: oldNode.position,
    parameters: { jsCode: INSERT_CODE, mode: "runOnceForAllItems", language: "javaScript" },
  };
  wf.nodes = wf.nodes.map((n) => (n.name === "Insert movimientos Supabase" ? newNode : n));

  await api("PUT", `/workflows/${SF_GASTO_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" },
    staticData: wf.staticData ?? null,
  });
  console.log("[OK] SF Gasto: Insert ahora tolera ausencia de columna `forma`.");
}

main().catch((e) => { console.error(e); process.exit(1); });
