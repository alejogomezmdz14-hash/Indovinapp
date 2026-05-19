/**
 * Indovina / n8n: saca el nodo "Mirror Sheets libro diario" del SF Gasto.
 *
 * Motivo: en el Google Sheet renombraron los headers del "Libro diario"
 *   (ahora son: Fecha, categoria, Detalle de los movimientos, ingresos,
 *    egresos, medio de ingreso, medio de egreso, total del dia ingreso,
 *    total del dia egresos).
 * Las columnas "Monto", "Proveedor", "Comentario", "Tipo comprobante",
 * "Numero comprobante", "Fecha vencimiento" ya no existen y el mirror
 * estaría empujando filas mal-formateadas. La app ya lee Supabase.
 *
 * Uso: node n8n/patch-sf-gasto-remove-mirror-sheets.mjs
 * Requiere en .env: N8N_API_URL, N8N_API_KEY
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
const N8N_API_URL = env.N8N_API_URL?.replace(/\/$/, "");
const N8N_API_KEY = env.N8N_API_KEY;
if (!N8N_API_URL || !N8N_API_KEY) {
  console.error("Faltan N8N_API_URL o N8N_API_KEY en .env");
  process.exit(1);
}

const SF_GASTO_ID = "OcPG64aOIccaaEZW";
const MIRROR_NODE_NAME = "Mirror Sheets libro diario";

async function api(method, path, body) {
  const res = await fetch(`${N8N_API_URL}/api/v1${path}`, {
    method,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

function rerouteAroundNode(connections, removedName) {
  // Si A -> removed -> B, queremos A -> B.
  const outgoing = connections[removedName]?.main ?? [];
  const downstreamTargets = outgoing.flat(); // [{node, type, index}, ...]

  const updated = { ...connections };
  delete updated[removedName];

  for (const [src, conn] of Object.entries(updated)) {
    if (!conn.main) continue;
    conn.main = conn.main.map((branch) =>
      branch.flatMap((edge) =>
        edge.node === removedName ? downstreamTargets : [edge],
      ),
    );
  }
  return updated;
}

async function main() {
  const wf = await api("GET", `/workflows/${SF_GASTO_ID}`);
  const nodeExists = wf.nodes.some((n) => n.name === MIRROR_NODE_NAME);
  if (!nodeExists) {
    console.log(`[OK] El nodo "${MIRROR_NODE_NAME}" ya no está. Nada que hacer.`);
    return;
  }
  console.log(`[INFO] Sacando nodo "${MIRROR_NODE_NAME}" y re-cableando.`);

  const newNodes = wf.nodes.filter((n) => n.name !== MIRROR_NODE_NAME);
  const newConnections = rerouteAroundNode(wf.connections, MIRROR_NODE_NAME);

  // n8n PUT /workflows/{id} sólo acepta name, nodes, connections, settings, staticData.
  const payload = {
    name: wf.name,
    nodes: newNodes,
    connections: newConnections,
    settings: wf.settings ?? { executionOrder: "v1" },
    staticData: wf.staticData ?? null,
  };
  await api("PUT", `/workflows/${SF_GASTO_ID}`, payload);
  console.log(`[OK] SF Gasto actualizado. Mirror Sheets eliminado.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
