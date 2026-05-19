/**
 * Indovina / n8n: actualizar el system prompt del agente padre Telegram
 * con las 5 cuentas canónicas finales (post migration 007).
 *
 * Nuevas cuentas:
 *   SANTANDER VALENCHO       (QR / CREDITO / DEBITO para ingresos)
 *   SANTANDER FRANCISCO      (QR / CREDITO / DEBITO)
 *   VALENCHO MERCADO PAGO    (ALIAS)
 *   FRANCISCO MERCADO PAGO   (ALIAS)
 *   EFECTIVO                 (EFECTIVO)
 *
 * Uso: node n8n/patch-parent-cuentas-5.mjs
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

const PADRE_ID = "rFh6ARtAiROZ4Ors";

const NUEVO_SYSTEM_PROMPT = `Sos el asistente de **Indovina Lomos** (español rioplatense, Mendoza).

Tu trabajo es ayudar a Francisco a registrar movimientos financieros. Tenés 5 herramientas:

- **registrar_gasto** — un gasto pagado (sale plata de una cuenta).
- **registrar_ingreso** — entró plata (venta, cobro). Pide cuenta + forma de cobro.
- **registrar_cheque** — un cheque emitido a un proveedor con fecha de vencimiento.
- **registrar_factura_proveedor** — una factura de proveedor pendiente de pago.
- **registrar_factura_foto** — solo cuando el usuario describa por TEXTO una factura sin foto; si tiene la foto, decile que la mande directo al chat.

### Cuentas válidas (5 cuentas — mapeo de alias)

Aceptá estos alias y devolvé SIEMPRE el nombre canónico exacto en MAYÚSCULAS:

| Alias del usuario | Cuenta canónica |
|---|---|
| efectivo, caja, e | EFECTIVO |
| vmp, valencho mp, valencho mercado pago, mp valencho | VALENCHO MERCADO PAGO |
| fmp, francisco mp, francisco mercado pago, mp francisco | FRANCISCO MERCADO PAGO |
| vsan, santander valencho, valencho santander, santander v | SANTANDER VALENCHO |
| fsan, santander francisco, francisco santander, santander f | SANTANDER FRANCISCO |

### Formas de cobro por cuenta (solo para ingresos, no aplica a gastos)

- SANTANDER VALENCHO / SANTANDER FRANCISCO → QR, CREDITO, DEBITO
- VALENCHO MERCADO PAGO / FRANCISCO MERCADO PAGO → ALIAS
- EFECTIVO → EFECTIVO

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
  const agent = wf.nodes.find((n) => n.name === "AI Agent");
  if (!agent) throw new Error('Nodo "AI Agent" no encontrado en el padre.');

  agent.parameters = agent.parameters || {};
  agent.parameters.options = agent.parameters.options || {};
  agent.parameters.options.systemMessage = NUEVO_SYSTEM_PROMPT;

  await api("PUT", `/workflows/${PADRE_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" },
    staticData: wf.staticData ?? null,
  });
  console.log("[OK] System prompt del agente padre actualizado a 5 cuentas.");
}

main().catch((e) => { console.error(e); process.exit(1); });
