/**
 * Indovina — Patch padre v3:
 *  • Renombra tools a registrar_gasto / registrar_cheque / registrar_factura_proveedor / registrar_factura_foto.
 *  • Agrega workflowInputs (schema JSON) a cada tool, así el AI Agent pasa datos estructurados.
 *  • Reescribe el systemMessage del AI Agent (alias de cuentas, formato, política).
 *
 * NO toca el Switch (sigue manejando solo texto/voz). La rama de fotos se agrega en otro patch.
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

const env = {
  ...loadEnv(path.join(root, ".env")),
  ...loadEnv(path.join(root, ".env.local")),
};
const base = (env.N8N_API_URL || "").replace(/\/$/, "");
const key = env.N8N_API_KEY;
if (!base || !key) throw new Error("Faltan N8N_API_URL o N8N_API_KEY en .env");

const PARENT_ID = "rFh6ARtAiROZ4Ors";

const SYSTEM_MESSAGE = `Sos el asistente de **Indovina Lomos** (español rioplatense, Mendoza).

Tu trabajo es ayudar a Francisco a registrar movimientos financieros. Tenés 4 herramientas:

- **registrar_gasto** — un gasto pagado (sale plata de una cuenta).
- **registrar_cheque** — un cheque emitido a un proveedor con fecha de vencimiento.
- **registrar_factura_proveedor** — una factura de proveedor pendiente de pago.
- **registrar_factura_foto** — solo cuando el usuario describa por TEXTO una factura sin foto; si tiene la foto, decile que la mande directo al chat.

### Cuentas válidas (mapeo de alias)

Aceptá estos alias y devolvé SIEMPRE el nombre canónico exacto en MAYÚSCULAS:

| Alias del usuario | Cuenta canónica |
|---|---|
| efectivo, caja, e | EFECTIVO |
| vmp1, valencho mp 1, valencho mercado pago 1 | VALENCHO MERCADO PAGO 1 |
| vmp2, valencho mp 2, valencho mercado pago 2 | VALENCHO MERCADO PAGO 2 |
| vsan, valencho santander | VALENCHO SANTANDER |
| fmp, francisco mp, francisco mercado pago | FRANCISCO MERCADO PAGO |
| fsan, francisco santander | FRANCISCO SANTANDER |

### Reglas de fechas

- Toda fecha en formato **DD/MM/AAAA**.
- Si el usuario dice "hoy" o no aclara, usá la fecha de hoy.
- "Mañana", "el viernes", "en 15 días" → convertís a DD/MM/AAAA.

### Política de carga

- Si faltan datos esenciales (cuenta, monto, proveedor), **pedilos antes** de llamar la herramienta. No inventes.
- Si todo está claro, llamá la herramienta directamente, sin pedir confirmación extra.
- Después de cargar, confirmá al usuario con una frase corta tipo "Listo: gasto de $5.000 en Peirone, efectivo. Saldo nuevo: $X".

### Saludos y conversación

Si el mensaje no pide registrar nada (saludos, dudas, "qué cuentas tengo"), respondé sin usar herramientas. Sé breve y rioplatense.`;

const TOOLS = [
  {
    id: "e1011111-1111-4111-8111-000000000001",
    name: "registrar_gasto",
    workflowId: "OcPG64aOIccaaEZW",
    description:
      "Registra un gasto pagado (sale plata de una cuenta). Usalo cuando el usuario describa que pagó algo.",
    schema: [
      { name: "cuenta", required: true, type: "string", description: "Cuenta canónica en MAYÚSCULAS (ej. EFECTIVO, VALENCHO SANTANDER)." },
      { name: "monto", required: true, type: "number", description: "Importe positivo en pesos (se descuenta de la cuenta)." },
      { name: "proveedor", required: true, type: "string", description: "A quién se le pagó." },
      { name: "categoria", required: false, type: "string", description: "Ej. Compras, Servicios, Insumos. Si no sabés, dejá vacío." },
      { name: "comentario", required: false, type: "string", description: "Detalle libre opcional." },
      { name: "fecha", required: false, type: "string", description: "DD/MM/AAAA. Si vacío, usa hoy." },
    ],
    y: -80,
  },
  {
    id: "e1011111-1111-4111-8111-000000000002",
    name: "registrar_cheque",
    workflowId: "iOAvoQaSdY7OmNHt",
    description:
      "Registra un cheque emitido a un proveedor con fecha de vencimiento. Usalo cuando el usuario hable de cheques a pagar.",
    schema: [
      { name: "proveedor", required: true, type: "string", description: "A nombre de quién va el cheque." },
      { name: "monto", required: true, type: "number", description: "Importe del cheque en pesos." },
      { name: "fecha_vencimiento", required: true, type: "string", description: "DD/MM/AAAA del vencimiento." },
      { name: "referencia", required: false, type: "string", description: "Número de cheque u observación." },
    ],
    y: 40,
  },
  {
    id: "e1011111-1111-4111-8111-000000000003",
    name: "registrar_factura_proveedor",
    workflowId: "CFovQKG2RvJ7OEFB",
    description:
      "Registra una factura de proveedor pendiente de pago. Usalo cuando el usuario describa una factura por texto (sin foto).",
    schema: [
      { name: "proveedor", required: true, type: "string", description: "Razón social del proveedor." },
      { name: "monto", required: true, type: "number", description: "Total final de la factura (con IVA y percepciones)." },
      { name: "fecha_vencimiento", required: true, type: "string", description: "DD/MM/AAAA del vencimiento." },
      { name: "referencia", required: false, type: "string", description: "Número de factura (ej. 0002-00098591)." },
    ],
    y: 160,
  },
  {
    id: "e1011111-1111-4111-8111-000000000004",
    name: "registrar_factura_foto",
    workflowId: "nT0MGKF7URJySwZM",
    description:
      "Registra factura por foto. NO usar si el usuario solo describe por texto — pedile que mande la foto al chat. Esta herramienta es solo backup.",
    schema: [
      { name: "proveedor", required: true, type: "string", description: "Si llegó a esta tool, asegurate de tener al menos el proveedor." },
      { name: "monto", required: true, type: "number", description: "Total final." },
      { name: "fecha_vencimiento", required: false, type: "string", description: "DD/MM/AAAA si aparece." },
      { name: "referencia", required: false, type: "string", description: "Número de factura si aparece." },
    ],
    y: 280,
  },
];

function buildToolWorkflowInputs(schema) {
  return {
    mappingMode: "defineBelow",
    value: Object.fromEntries(schema.map((f) => [f.name, `={{ $fromAI('${f.name}', '${f.description.replace(/'/g, "\\'")}', '${f.type}') }}`])),
    schema: schema.map((f) => ({
      id: f.name,
      displayName: f.name,
      required: !!f.required,
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
}

const REMOVE_IDS_LEGACY = new Set([
  "e1011111-1111-4111-8111-000000000001",
  "e1011111-1111-4111-8111-000000000002",
  "e1011111-1111-4111-8111-000000000003",
  "e1011111-1111-4111-8111-000000000004",
]);
const REMOVE_NAMES_LEGACY = new Set([
  "Tool SF Gasto",
  "Tool SF Cheque",
  "Tool SF Factura proveedor",
  "Tool SF Factura foto",
]);

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

const url = `${base}/api/v1/workflows/${PARENT_ID}`;
const wf = await api("GET", url);

const cleanedNodes = wf.nodes.filter(
  (n) => !REMOVE_IDS_LEGACY.has(n.id) && !REMOVE_NAMES_LEGACY.has(n.name),
);

const newToolNodes = TOOLS.map((t) => ({
  id: t.id,
  name: t.name,
  type: "@n8n/n8n-nodes-langchain.toolWorkflow",
  typeVersion: 2.2,
  position: [120, t.y],
  parameters: {
    description: t.description,
    workflowId: t.workflowId,
    workflowInputs: buildToolWorkflowInputs(t.schema),
  },
}));

for (const n of cleanedNodes) {
  if (n.name === "AI Agent") {
    n.parameters = {
      ...n.parameters,
      promptType: "define",
      text: "={{ $json.text || $json.message?.text || $('Telegram Trigger').item.json.message?.text || '' }}",
      options: {
        ...(n.parameters?.options || {}),
        systemMessage: SYSTEM_MESSAGE,
      },
    };
  }
}

const nodes = [...cleanedNodes, ...newToolNodes];

const connections = { ...wf.connections };
for (const legacy of REMOVE_NAMES_LEGACY) {
  delete connections[legacy];
}
for (const t of TOOLS) {
  connections[t.name] = {
    ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
  };
}

await api("PUT", url, {
  name: wf.name,
  nodes,
  connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
});

console.log("✓ Padre actualizado:");
console.log("  - 4 tools renombradas con schema JSON");
console.log("  - systemMessage reescrito");
console.log("  - Switch sin cambios (rama foto pendiente)");
