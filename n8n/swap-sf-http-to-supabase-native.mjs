/**
 * Crea (si no existe) la credencial n8n "Indovina Supabase API" (supabaseApi)
 * y reemplaza en los 4 SF el nodo HTTP de insert por el nodo nativo Supabase (Row → Create, auto-map).
 *
 * Requiere en .env o .env.local:
 *   N8N_API_URL, N8N_API_KEY
 *   y UNA de estas opciones:
 *   A) NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY → crea/usa credencial por POST
 *   B) INDOVINA_SUPABASE_CREDENTIAL_ID → usa credencial supabaseApi ya creada en n8n (útil si GET /credentials da 405)
 *
 * Uso: node n8n/swap-sf-http-to-supabase-native.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const envLocalPath = path.join(root, ".env.local");

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

function mergeEnvFiles() {
  const merged = {};
  for (const p of [envPath, envLocalPath]) {
    if (fs.existsSync(p)) Object.assign(merged, loadEnv(p));
  }
  return merged;
}

const env = mergeEnvFiles();
const base = (env.N8N_API_URL || "").replace(/\/$/, "");
const key = env.N8N_API_KEY;
const host = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY || "";
const existingCredId = (env.INDOVINA_SUPABASE_CREDENTIAL_ID || env.N8N_SUPABASE_CREDENTIAL_ID || "").trim();
const existingCredName = (env.INDOVINA_SUPABASE_CREDENTIAL_NAME || "").trim() || "Indovina Supabase API";

if (!base || !key) throw new Error("Faltan N8N_API_URL o N8N_API_KEY en .env / .env.local");

const CRED_NAME = "Indovina Supabase API";

async function api(method, url, body) {
  const opts = {
    method,
    headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Muchas instancias (p. ej. Easypanel) responden 405 a GET /api/v1/credentials.
 * Crear credencial solo con POST es lo portable.
 */
async function ensureSupabaseCredential() {
  if (existingCredId) {
    return { id: existingCredId, name: existingCredName };
  }

  if (!host || !serviceRole) {
    throw new Error(
      [
        "Falta configuración Supabase para crear la credencial en n8n:",
        "  • Agregá SUPABASE_SERVICE_ROLE_KEY (y NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL) en .env,",
        "    o bien creá en n8n una credencial tipo Supabase API y poné su id en:",
        "    INDOVINA_SUPABASE_CREDENTIAL_ID=...",
        "",
        "La service_role está en Supabase → Settings → API (solo servidor).",
      ].join("\n"),
    );
  }

  const listUrl = `${base}/api/v1/credentials`;
  const created = await api("POST", listUrl, {
    name: CRED_NAME,
    type: "supabaseApi",
    data: { host, serviceRole },
  });
  const id = created.id ?? created.data?.id;
  if (!id) throw new Error("No se pudo crear la credencial Supabase (respuesta sin id)");
  return { id, name: CRED_NAME };
}

function supabaseInsertNode({ id, name, position, tableId, cred }) {
  return {
    id,
    name,
    type: "n8n-nodes-base.supabase",
    typeVersion: 1,
    position,
    parameters: {
      useCustomSchema: false,
      resource: "row",
      operation: "create",
      tableId,
      dataToSend: "autoMapInputData",
      inputsToIgnore: "",
    },
    credentials: {
      supabaseApi: { id: cred.id, name: cred.name },
    },
  };
}

/** Renombra claves de conexión y referencias `node` de fromName → toName. */
function renameConnectionsInWorkflow(connections, fromName, toName) {
  const next = structuredClone(connections);
  if (next[fromName]) {
    next[toName] = next[fromName];
    delete next[fromName];
  }
  for (const key of Object.keys(next)) {
    const main = next[key]?.main;
    if (!Array.isArray(main)) continue;
    for (const branch of main) {
      if (!Array.isArray(branch)) continue;
      for (const edge of branch) {
        if (edge && edge.node === fromName) edge.node = toName;
      }
    }
  }
  return next;
}

const WORKFLOWS = [
  {
    id: "OcPG64aOIccaaEZW",
    httpNodeId: "b1000001-0000-4000-8000-000000000004",
    fromName: "Insert movimientos REST",
    toName: "Insert movimientos Supabase",
    tableId: "movimientos",
  },
  {
    id: "iOAvoQaSdY7OmNHt",
    httpNodeId: "c1000001-0000-4000-8000-000000000004",
    fromName: "Insert cheques REST",
    toName: "Insert cheques Supabase",
    tableId: "cheques",
  },
  {
    id: "CFovQKG2RvJ7OEFB",
    httpNodeId: "c1000001-0000-4000-8000-000000000004",
    fromName: "Insert facturas_proveedor REST",
    toName: "Insert facturas_proveedor Supabase",
    tableId: "facturas_proveedor",
  },
  {
    id: "nT0MGKF7URJySwZM",
    httpNodeId: "c1000001-0000-4000-8000-000000000004",
    fromName: "Insert facturas_foto REST",
    toName: "Insert facturas_foto Supabase",
    tableId: "facturas_proveedor",
  },
];

const cred = await ensureSupabaseCredential();

for (const w of WORKFLOWS) {
  const url = `${base}/api/v1/workflows/${w.id}`;
  const wf = await api("GET", url);
  const nodes = wf.nodes.map((n) => {
    if (n.id !== w.httpNodeId) return n;
    return supabaseInsertNode({
      id: n.id,
      name: w.toName,
      position: n.position,
      tableId: w.tableId,
      cred,
    });
  });

  let connections = { ...wf.connections };
  if (w.fromName !== w.toName) {
    connections = renameConnectionsInWorkflow(connections, w.fromName, w.toName);
  }

  await api("PUT", url, {
    name: wf.name,
    nodes,
    connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("OK workflow", w.id, "→", w.toName, "tabla", w.tableId);
}

console.log("\nListo. Credencial:", cred.name, "(id:", cred.id + ")", "| Guardá en n8n y probá un subflujo.");
