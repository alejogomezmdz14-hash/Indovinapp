/**
 * Arregla las tools registrar_gasto y registrar_ingreso del padre Telegram:
 * solo los campos obligatorios (cuenta, forma, monto, proveedor). Los opcionales
 * (categoria, comentario, fecha) se omiten — los subflows ya tienen defaults
 * (fecha = hoy, categoria = "Gasto" / "Ingreso", comentario = "").
 *
 * Causa raíz: LangChain en n8n trata todo lo que está en `value` como required,
 * incluso si el schema dice required:false. Por eso fallaba con "Required → at comentario".
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
const PADRE_ID = "rFh6ARtAiROZ4Ors";

const TOOLS_SCHEMA = {
  registrar_gasto: {
    description:
      "Registra un gasto pagado (sale plata). Cuentas y formas válidas: SANTANDER VALENCHO/SANTANDER FRANCISCO → QR/CREDITO/DEBITO; VALENCHO MERCADO PAGO/FRANCISCO MERCADO PAGO → ALIAS; EFECTIVO → EFECTIVO.",
    value: {
      cuenta:    "={{ $fromAI('cuenta',    'Cuenta canónica MAYÚSCULAS: SANTANDER VALENCHO, SANTANDER FRANCISCO, VALENCHO MERCADO PAGO, FRANCISCO MERCADO PAGO, EFECTIVO.', 'string') }}",
      forma:     "={{ $fromAI('forma',     'Forma de pago: QR, CREDITO, DEBITO, ALIAS o EFECTIVO. Tiene que ser compatible con la cuenta.', 'string') }}",
      monto:     "={{ $fromAI('monto',     'Importe positivo en pesos.', 'number') }}",
      proveedor: "={{ $fromAI('proveedor', 'A quién se le pagó.', 'string') }}",
    },
    schema: [
      { id: "cuenta",    type: "string", description: "Cuenta canónica MAYÚSCULAS." },
      { id: "forma",     type: "string", description: "QR, CREDITO, DEBITO, ALIAS o EFECTIVO." },
      { id: "monto",     type: "number", description: "Importe positivo." },
      { id: "proveedor", type: "string", description: "A quién se le pagó." },
    ],
  },
  registrar_ingreso: {
    description:
      "Registra un INGRESO (venta) con cuenta y forma de cobro. Cuentas y formas válidas: SANTANDER VALENCHO/SANTANDER FRANCISCO → QR/CREDITO/DEBITO; VALENCHO MERCADO PAGO/FRANCISCO MERCADO PAGO → ALIAS; EFECTIVO → EFECTIVO.",
    value: {
      cuenta: "={{ $fromAI('cuenta', 'Cuenta canónica MAYÚSCULAS.', 'string') }}",
      forma:  "={{ $fromAI('forma',  'Forma de cobro: QR, CREDITO, DEBITO, ALIAS o EFECTIVO.', 'string') }}",
      monto:  "={{ $fromAI('monto',  'Importe positivo en pesos.', 'number') }}",
    },
    schema: [
      { id: "cuenta", type: "string", description: "Cuenta canónica MAYÚSCULAS." },
      { id: "forma",  type: "string", description: "QR, CREDITO, DEBITO, ALIAS o EFECTIVO." },
      { id: "monto",  type: "number", description: "Importe positivo." },
    ],
  },
};

async function api(method, urlPath, body) {
  const r = await fetch(`${URL}/api/v1${urlPath}`, {
    method,
    headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${urlPath} -> ${r.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const wf = await api("GET", `/workflows/${PADRE_ID}`);

  for (const [toolName, cfg] of Object.entries(TOOLS_SCHEMA)) {
    const node = wf.nodes.find((n) => n.name === toolName);
    if (!node) {
      console.warn(`[WARN] tool ${toolName} no encontrada`);
      continue;
    }
    node.parameters.description = cfg.description;
    node.parameters.workflowInputs = {
      mappingMode: "defineBelow",
      value: cfg.value,
      schema: cfg.schema.map((f) => ({
        id: f.id,
        displayName: f.id,
        required: true,
        defaultMatch: false,
        display: true,
        canBeUsedToMatch: true,
        type: f.type,
        description: f.description,
      })),
      matchingColumns: [],
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    };
    console.log(`[OK] tool ${toolName} simplificada a ${cfg.schema.length} parámetros.`);
  }

  await api("PUT", `/workflows/${PADRE_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" },
    staticData: wf.staticData ?? null,
  });
  console.log("[OK] Padre guardado.");
}
main().catch((e) => { console.error(e); process.exit(1); });
