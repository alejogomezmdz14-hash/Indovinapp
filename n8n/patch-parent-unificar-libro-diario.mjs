/**
 * Reemplaza las tools `registrar_gasto` y `registrar_ingreso` por una sola
 * `libro_diario` que recibe `tipo: ingreso|egreso`. Mantiene las otras tools
 * (cheque, factura_proveedor, factura_foto) intactas. Actualiza el system prompt.
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
const PADRE_ID = "rFh6ARtAiROZ4Ors";
const SF_LIBRO_DIARIO_ID = "OcPG64aOIccaaEZW";

const SYSTEM_PROMPT = `Sos el asistente de **Indovina Lomos** (español rioplatense, Mendoza).

Ayudás a Francisco a registrar movimientos financieros. Tenés 4 herramientas:

- **libro_diario** — registra un movimiento (ingreso o egreso) en el Libro diario.
- **registrar_cheque** — un cheque emitido a un proveedor con fecha de vencimiento.
- **registrar_factura_proveedor** — una factura de proveedor pendiente de pago.
- **registrar_factura_foto** — solo cuando el usuario describa por TEXTO una factura sin foto.

### libro_diario — parámetros y reglas

Parámetros obligatorios: **tipo, cuenta, forma, monto**.

\`tipo\` solo puede ser \`"ingreso"\` o \`"egreso"\`:
- INGRESO = entra plata (venta, cobro).
- EGRESO  = sale plata (pago, gasto).

### Cuentas válidas (5 cuentas)

| Alias | Canónico |
|---|---|
| efectivo, caja | EFECTIVO |
| vmp, valencho mp, mp valencho | VALENCHO MERCADO PAGO |
| fmp, francisco mp, mp francisco | FRANCISCO MERCADO PAGO |
| vsan, santander valencho | SANTANDER VALENCHO |
| fsan, santander francisco | SANTANDER FRANCISCO |

### Formas por tipo y cuenta — IMPORTANTE: INGRESO ≠ EGRESO

**INGRESO** (entra plata):
- SANTANDER VALENCHO / SANTANDER FRANCISCO → **QR, CREDITO, DEBITO**
- VALENCHO MERCADO PAGO / FRANCISCO MERCADO PAGO → **ALIAS**
- EFECTIVO → **EFECTIVO**

**EGRESO** (sale plata):
- SANTANDER VALENCHO / SANTANDER FRANCISCO → **TRANSFERENCIA, CREDITO, DEBITO, CHEQUE**
- VALENCHO MERCADO PAGO / FRANCISCO MERCADO PAGO → **TRANSFERENCIA, DEBITO**
- EFECTIVO → **EFECTIVO**

**Regla crítica:** NUNCA llames a libro_diario sin tener tipo, cuenta, forma y monto.

- Si el usuario dice "pagué $5.000 a Peirone": tipo=egreso, falta cuenta y forma. Preguntá: "¿Desde qué cuenta y cómo? (efectivo / transferencia desde Santander / cheque / crédito / débito)".
- Si el usuario dice "cobré $80.000": tipo=ingreso, falta cuenta y forma. Preguntá: "¿En qué cuenta y por qué medio? (Santander QR/crédito/débito, MP alias, efectivo)".
- Si dice "vendí" o "entró" → tipo=ingreso. Si dice "pagué", "gasté", "compré" → tipo=egreso.

### Reglas de fechas

- Formato **DD/MM/AAAA**. Si dice "hoy" o no aclara, hoy.

### Confirmación

Después de cargar, confirmá corto:
- Egreso: "Listo: gasto de $5.000 pagado desde EFECTIVO/EFECTIVO. Saldo: $X".
- Ingreso: "Listo: ingreso de $80.000 cobrado en SANTANDER VALENCHO/QR. Saldo: $X".

### Saludos y conversación

Si el mensaje no pide registrar nada, respondé sin tools. Sé breve y rioplatense.`;

const LIBRO_DIARIO_TOOL = {
  id: "e1011111-1111-4111-8111-00000000000a",
  name: "libro_diario",
  type: "@n8n/n8n-nodes-langchain.toolWorkflow",
  typeVersion: 2.2,
  position: [120, 0],
  parameters: {
    description:
      "Registra un movimiento en el Libro diario (ingreso o egreso). Para INGRESO usar formas QR/CREDITO/DEBITO/ALIAS/EFECTIVO según cuenta. Para EGRESO usar formas TRANSFERENCIA/CREDITO/DEBITO/CHEQUE/EFECTIVO según cuenta. NUNCA llames sin tener tipo + cuenta + forma + monto.",
    workflowId: { __rl: true, value: SF_LIBRO_DIARIO_ID, mode: "id" },
    workflowInputs: {
      mappingMode: "defineBelow",
      value: {
        tipo:      "={{ $fromAI('tipo',      'Tipo de movimiento: ingreso (entra plata) o egreso (sale plata).', 'string') }}",
        cuenta:    "={{ $fromAI('cuenta',    'Cuenta canónica MAYÚSCULAS: SANTANDER VALENCHO, SANTANDER FRANCISCO, VALENCHO MERCADO PAGO, FRANCISCO MERCADO PAGO, EFECTIVO.', 'string') }}",
        forma:     "={{ $fromAI('forma',     'Forma del movimiento. INGRESO: QR/CREDITO/DEBITO/ALIAS/EFECTIVO. EGRESO: TRANSFERENCIA/CREDITO/DEBITO/CHEQUE/EFECTIVO. Compatible con la cuenta.', 'string') }}",
        monto:     "={{ $fromAI('monto',     'Importe positivo en pesos.', 'number') }}",
        proveedor: "={{ $fromAI('proveedor', 'Para EGRESO: a quién se le pagó. Para INGRESO: descripción del cobro (cliente, venta, etc.).', 'string') }}",
      },
      schema: [
        { id: "tipo",      type: "string", description: "ingreso o egreso" },
        { id: "cuenta",    type: "string", description: "Cuenta canónica MAYÚSCULAS." },
        { id: "forma",     type: "string", description: "Forma compatible con la cuenta y el tipo." },
        { id: "monto",     type: "number", description: "Importe positivo." },
        { id: "proveedor", type: "string", description: "Proveedor (egreso) o descripción (ingreso)." },
      ].map((f) => ({ ...f, displayName: f.id, required: true, defaultMatch: false, display: true, canBeUsedToMatch: true })),
      matchingColumns: [],
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
  },
};

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
  const wf = await api("GET", `/workflows/${PADRE_ID}`);

  // 1) Sacar tools viejas
  const namesToRemove = new Set(["registrar_gasto", "registrar_ingreso"]);
  wf.nodes = wf.nodes.filter((n) => !namesToRemove.has(n.name));

  // 2) Limpiar conexiones a esas tools viejas
  if (wf.connections) {
    for (const k of Array.from(Object.keys(wf.connections))) {
      if (namesToRemove.has(k)) delete wf.connections[k];
    }
  }

  // 3) Agregar / actualizar libro_diario tool
  const existingIdx = wf.nodes.findIndex((n) => n.name === "libro_diario");
  if (existingIdx >= 0) {
    wf.nodes[existingIdx] = LIBRO_DIARIO_TOOL;
    console.log("[INFO] libro_diario ya existía — actualizada.");
  } else {
    wf.nodes.push(LIBRO_DIARIO_TOOL);
    console.log("[INFO] libro_diario agregada.");
  }

  // 4) Conexión libro_diario → AI Agent (ai_tool)
  wf.connections = wf.connections || {};
  wf.connections["libro_diario"] = {
    ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
  };

  // 5) System prompt
  const agent = wf.nodes.find((n) => n.name === "AI Agent");
  agent.parameters.options = agent.parameters.options || {};
  agent.parameters.options.systemMessage = SYSTEM_PROMPT;

  await api("PUT", `/workflows/${PADRE_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" }, staticData: wf.staticData ?? null,
  });
  console.log("[OK] Padre: 1 tool unificada (libro_diario) + 3 originales (cheque, factura_proveedor, factura_foto).");
}
main().catch((e) => { console.error(e); process.exit(1); });
