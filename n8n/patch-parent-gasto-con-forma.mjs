/**
 * Actualiza la tool `registrar_gasto` del padre Telegram para que pida `forma`
 * (QR/CREDITO/DEBITO/ALIAS/EFECTIVO) y refuerza el system prompt.
 *
 * Uso: node n8n/patch-parent-gasto-con-forma.mjs
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
const PADRE_ID = "rFh6ARtAiROZ4Ors";

const SYSTEM_PROMPT = `Sos el asistente de **Indovina Lomos** (español rioplatense, Mendoza).

Tu trabajo es ayudar a Francisco a registrar movimientos financieros. Tenés 5 herramientas:

- **registrar_gasto** — un gasto pagado (sale plata). Pide cuenta + forma.
- **registrar_ingreso** — entró plata (venta, cobro). Pide cuenta + forma.
- **registrar_cheque** — un cheque emitido a un proveedor con fecha de vencimiento.
- **registrar_factura_proveedor** — una factura de proveedor pendiente de pago.
- **registrar_factura_foto** — solo cuando el usuario describa por TEXTO una factura sin foto.

### Cuentas válidas (5 cuentas — mapeo de alias)

| Alias del usuario | Cuenta canónica |
|---|---|
| efectivo, caja, e | EFECTIVO |
| vmp, valencho mp, valencho mercado pago, mp valencho | VALENCHO MERCADO PAGO |
| fmp, francisco mp, francisco mercado pago, mp francisco | FRANCISCO MERCADO PAGO |
| vsan, santander valencho, valencho santander, santander v | SANTANDER VALENCHO |
| fsan, santander francisco, francisco santander, santander f | SANTANDER FRANCISCO |

### Formas de pago/cobro por cuenta (OBLIGATORIO para gastos e ingresos)

- SANTANDER VALENCHO / SANTANDER FRANCISCO → **QR, CREDITO, DEBITO**
- VALENCHO MERCADO PAGO / FRANCISCO MERCADO PAGO → **ALIAS**
- EFECTIVO → **EFECTIVO**

**Regla crítica:** NUNCA ejecutes registrar_gasto ni registrar_ingreso sin tener cuenta Y forma. Si el usuario te dice "pagué $5000 a Peirone", **antes** de llamar la tool, preguntá: "¿Con qué cuenta y forma? (efectivo, MP alias, Santander QR/crédito/débito)". Si dice "efectivo" → cuenta EFECTIVO, forma EFECTIVO. Si dice "Santander con QR" → cuenta SANTANDER VALENCHO o FRANCISCO + forma QR (pedí cuál si no aclaró).

### Reglas de fechas

- Toda fecha en formato **DD/MM/AAAA**.
- Si el usuario dice "hoy" o no aclara, usá la fecha de hoy.
- "Mañana", "el viernes", "en 15 días" → convertís a DD/MM/AAAA.

### Política de carga

- Si faltan datos esenciales (cuenta, forma, monto, proveedor), **pedilos antes** de llamar la herramienta. No inventes.
- Si todo está claro, llamá la herramienta directamente.
- Después de cargar, confirmá: "Listo: gasto de $5.000 en Peirone, EFECTIVO/EFECTIVO. Saldo nuevo: $X".

### Saludos y conversación

Si el mensaje no pide registrar nada, respondé sin usar herramientas. Sé breve y rioplatense.`;

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

async function main() {
  const wf = await api("GET", `/workflows/${PADRE_ID}`);

  // 1) System prompt
  const agent = wf.nodes.find((n) => n.name === "AI Agent");
  agent.parameters.options = agent.parameters.options || {};
  agent.parameters.options.systemMessage = SYSTEM_PROMPT;

  // 2) Tool registrar_gasto: agregar `forma`
  const gasto = wf.nodes.find((n) => n.name === "registrar_gasto");
  if (!gasto) throw new Error('Tool registrar_gasto no encontrada');
  gasto.parameters.description =
    "Registra un gasto pagado (sale plata). REQUIERE cuenta + forma. Cuentas y formas válidas: SANTANDER VALENCHO/SANTANDER FRANCISCO → QR/CREDITO/DEBITO; VALENCHO MERCADO PAGO/FRANCISCO MERCADO PAGO → ALIAS; EFECTIVO → EFECTIVO.";
  gasto.parameters.workflowInputs = {
    mappingMode: "defineBelow",
    value: {
      cuenta:    "={{ $fromAI('cuenta',    'Cuenta canónica MAYÚSCULAS.', 'string') }}",
      forma:     "={{ $fromAI('forma',     'Forma de pago: QR, CREDITO, DEBITO, ALIAS o EFECTIVO. Tiene que ser compatible con la cuenta.', 'string') }}",
      monto:     "={{ $fromAI('monto',     'Importe positivo en pesos (se descuenta de la cuenta).', 'number') }}",
      proveedor: "={{ $fromAI('proveedor', 'A quién se le pagó.', 'string') }}",
      categoria: "={{ $fromAI('categoria', 'Ej. Compras, Servicios, Insumos.', 'string') }}",
      comentario:"={{ $fromAI('comentario','Detalle libre opcional.', 'string') }}",
      fecha:     "={{ $fromAI('fecha',     'DD/MM/AAAA. Si vacío, hoy.', 'string') }}",
    },
    schema: [
      { id: "cuenta",     displayName: "cuenta",     required: true,  type: "string", description: "Cuenta canónica MAYÚSCULAS." },
      { id: "forma",      displayName: "forma",      required: true,  type: "string", description: "QR, CREDITO, DEBITO, ALIAS o EFECTIVO." },
      { id: "monto",      displayName: "monto",      required: true,  type: "number", description: "Importe positivo en pesos." },
      { id: "proveedor",  displayName: "proveedor",  required: true,  type: "string", description: "A quién se le pagó." },
      { id: "categoria",  displayName: "categoria",  required: false, type: "string", description: "Ej. Compras, Servicios, Insumos." },
      { id: "comentario", displayName: "comentario", required: false, type: "string", description: "Detalle libre." },
      { id: "fecha",      displayName: "fecha",      required: false, type: "string", description: "DD/MM/AAAA." },
    ].map((f) => ({ ...f, defaultMatch: false, display: true, canBeUsedToMatch: true })),
    matchingColumns: [],
    attemptToConvertTypes: false,
    convertFieldsToString: false,
  };

  await api("PUT", `/workflows/${PADRE_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" },
    staticData: wf.staticData ?? null,
  });
  console.log("[OK] Padre actualizado: tool registrar_gasto con forma + system prompt reforzado.");
}
main().catch((e) => { console.error(e); process.exit(1); });
