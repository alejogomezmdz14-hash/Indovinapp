/**
 * Indovina / n8n: agrega la tool `registrar_ingreso` al agente padre Telegram.
 *
 * Antes de correr:
 *   1. node n8n/create-sf-ingreso.mjs            # crea el SF Ingreso y te devuelve su ID
 *   2. Pegá ese ID en SF_INGRESO_ID acá abajo (o pasalo por env: SF_INGRESO_ID=...).
 *   3. node n8n/patch-parent-add-tool-ingreso.mjs
 *
 * Idempotente: si la tool ya existe en el padre, la actualiza.
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
const SF_INGRESO_ID = process.env.SF_INGRESO_ID || env.SF_INGRESO_ID || ""; // pegá el ID aquí o por env

if (!N8N_API_URL || !N8N_API_KEY) {
  console.error("Faltan N8N_API_URL o N8N_API_KEY en .env");
  process.exit(1);
}
if (!SF_INGRESO_ID) {
  console.error("Falta SF_INGRESO_ID — corré primero create-sf-ingreso.mjs y pegá el ID aquí o via env SF_INGRESO_ID=...");
  process.exit(1);
}

const PADRE_ID = "rFh6ARtAiROZ4Ors";
const TOOL_NODE_ID = "e1011111-1111-4111-8111-000000000005";
const TOOL_NODE_NAME = "registrar_ingreso";

async function api(method, urlPath, body) {
  const res = await fetch(`${N8N_API_URL}/api/v1${urlPath}`, {
    method,
    headers: { "X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function buildToolNode() {
  return {
    id: TOOL_NODE_ID,
    name: TOOL_NODE_NAME,
    type: "@n8n/n8n-nodes-langchain.toolWorkflow",
    typeVersion: 2.2,
    position: [120, 400],
    parameters: {
      description:
        "Registra un INGRESO (venta) con su cuenta y forma de cobro. Usalo cuando el usuario diga que entró plata, cobró, vendió. Cuentas válidas y formas: SANTANDER VALENCHO/SANTANDER FRANCISCO → QR/CREDITO/DEBITO; VALENCHO MERCADO PAGO/FRANCISCO MERCADO PAGO → ALIAS; EFECTIVO → EFECTIVO.",
      workflowId: { __rl: true, value: SF_INGRESO_ID, mode: "id" },
      workflowInputs: {
        mappingMode: "defineBelow",
        value: {
          cuenta:   "={{ $fromAI('cuenta',   'Cuenta canónica MAYÚSCULAS: SANTANDER VALENCHO, SANTANDER FRANCISCO, VALENCHO MERCADO PAGO, FRANCISCO MERCADO PAGO, EFECTIVO.', 'string') }}",
          forma:    "={{ $fromAI('forma',    'Forma de cobro: QR, CREDITO, DEBITO, ALIAS o EFECTIVO. Tiene que ser compatible con la cuenta.', 'string') }}",
          monto:    "={{ $fromAI('monto',    'Importe positivo en pesos.', 'number') }}",
          proveedor:"={{ $fromAI('proveedor','De dónde vino el ingreso (cliente, descripción). Por defecto: \"Venta\".', 'string') }}",
          fecha:    "={{ $fromAI('fecha',    'DD/MM/AAAA. Si vacío, hoy.', 'string') }}",
          comentario:"={{ $fromAI('comentario','Detalle libre opcional.', 'string') }}",
        },
        schema: [
          { id: "cuenta",     displayName: "cuenta",     required: true,  type: "string", description: "Cuenta canónica MAYÚSCULAS." },
          { id: "forma",      displayName: "forma",      required: true,  type: "string", description: "QR, CREDITO, DEBITO, ALIAS o EFECTIVO." },
          { id: "monto",      displayName: "monto",      required: true,  type: "number", description: "Importe positivo." },
          { id: "proveedor",  displayName: "proveedor",  required: false, type: "string", description: "Cliente o descripción." },
          { id: "fecha",      displayName: "fecha",      required: false, type: "string", description: "DD/MM/AAAA." },
          { id: "comentario", displayName: "comentario", required: false, type: "string", description: "Detalle libre." },
        ].map((f) => ({ ...f, defaultMatch: false, display: true, canBeUsedToMatch: true })),
        matchingColumns: [],
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
    },
  };
}

async function main() {
  const wf = await api("GET", `/workflows/${PADRE_ID}`);
  const nuevoNodo = buildToolNode();

  // Reemplaza si ya existe; si no, lo agrega.
  const existingIdx = wf.nodes.findIndex((n) => n.name === TOOL_NODE_NAME);
  if (existingIdx >= 0) {
    wf.nodes[existingIdx] = nuevoNodo;
    console.log(`[INFO] Tool ${TOOL_NODE_NAME} existía — actualizada.`);
  } else {
    wf.nodes.push(nuevoNodo);
    console.log(`[INFO] Tool ${TOOL_NODE_NAME} agregada al padre.`);
  }

  // Conexión: tool -> AI Agent (ai_tool).
  wf.connections = wf.connections || {};
  wf.connections[TOOL_NODE_NAME] = {
    ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
  };

  await api("PUT", `/workflows/${PADRE_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" },
    staticData: wf.staticData ?? null,
  });
  console.log(`[OK] Padre actualizado con tool ${TOOL_NODE_NAME}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
