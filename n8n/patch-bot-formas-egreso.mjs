/**
 * Diferencia las formas de EGRESO (gastos / pagos) de las de INGRESO (cobros) en el bot.
 *
 * INGRESO (cómo entra plata):
 *   SANTANDER VAL/FRA → QR, CREDITO, DEBITO
 *   MERCADO PAGO VAL/FRA → ALIAS
 *   EFECTIVO → EFECTIVO
 *
 * EGRESO (cómo sale plata):
 *   SANTANDER VAL/FRA → TRANSFERENCIA, CREDITO, DEBITO, CHEQUE
 *   MERCADO PAGO VAL/FRA → TRANSFERENCIA, DEBITO
 *   EFECTIVO → EFECTIVO
 *
 * Actualiza: SF Gasto (validador) + tool registrar_gasto + system prompt del padre.
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
const SF_GASTO_ID = "OcPG64aOIccaaEZW";

const FORMAS_EGRESO_JS = `const FORMAS_POR_CUENTA = {
  "SANTANDER VALENCHO":      ["TRANSFERENCIA", "CREDITO", "DEBITO", "CHEQUE"],
  "SANTANDER FRANCISCO":     ["TRANSFERENCIA", "CREDITO", "DEBITO", "CHEQUE"],
  "VALENCHO MERCADO PAGO":   ["TRANSFERENCIA", "DEBITO"],
  "FRANCISCO MERCADO PAGO":  ["TRANSFERENCIA", "DEBITO"],
  "EFECTIVO":                ["EFECTIVO"],
};
`;

const NEW_PREPARAR_CODE = `${FORMAS_EGRESO_JS}
const j = $input.first().json;
function fechaHoy() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
const cuenta = String(j.cuenta || '').trim().toUpperCase();
const forma  = String(j.forma  || '').trim().toUpperCase();
const formasValidas = FORMAS_POR_CUENTA[cuenta];
if (!formasValidas) throw new Error('Cuenta inválida: ' + cuenta + '. Cuentas: ' + Object.keys(FORMAS_POR_CUENTA).join(', '));
if (!formasValidas.includes(forma)) {
  throw new Error('Forma "' + forma + '" no permitida para ' + cuenta + '. Válidas para EGRESO: ' + formasValidas.join(', '));
}
const monto = Math.abs(Number(j.monto));
if (!monto || isNaN(monto)) throw new Error('Monto inválido: ' + j.monto);
const proveedor = String(j.proveedor || '').trim() || 'sin especificar';
const categoria = String(j.categoria || '').trim() || 'Gasto';
const comentario = String(j.comentario || '').trim();
const fecha = String(j.fecha || '').trim() || fechaHoy();
return [{
  json: {
    fecha,
    monto: -monto,
    proveedor,
    categoria,
    comentario,
    tipo_comprobante: '',
    numero_comprobante: '',
    fecha_vencimiento: '',
    origen: 'n8n',
    cuenta,
    forma,
    _monto_positivo: monto
  }
}];`;

const SYSTEM_PROMPT = `Sos el asistente de **Indovina Lomos** (español rioplatense, Mendoza).

Tu trabajo es ayudar a Francisco a registrar movimientos financieros. Tenés 5 herramientas:

- **registrar_gasto** — sale plata. Pide cuenta + forma de PAGO.
- **registrar_ingreso** — entra plata. Pide cuenta + forma de COBRO.
- **registrar_cheque** — un cheque emitido a un proveedor con fecha de vencimiento.
- **registrar_factura_proveedor** — una factura de proveedor pendiente de pago.
- **registrar_factura_foto** — solo si el usuario describe por TEXTO una factura sin foto.

### Cuentas válidas (5 cuentas)

| Alias | Canónico |
|---|---|
| efectivo, caja, e | EFECTIVO |
| vmp, valencho mp, mp valencho | VALENCHO MERCADO PAGO |
| fmp, francisco mp, mp francisco | FRANCISCO MERCADO PAGO |
| vsan, santander valencho | SANTANDER VALENCHO |
| fsan, santander francisco | SANTANDER FRANCISCO |

### Formas válidas por cuenta — IMPORTANTE: EGRESO ≠ INGRESO

**INGRESO (cuando ENTRA plata):**
- SANTANDER VALENCHO / SANTANDER FRANCISCO → **QR, CREDITO, DEBITO**
- VALENCHO MERCADO PAGO / FRANCISCO MERCADO PAGO → **ALIAS**
- EFECTIVO → **EFECTIVO**

**EGRESO (cuando SALE plata para pagar):**
- SANTANDER VALENCHO / SANTANDER FRANCISCO → **TRANSFERENCIA, CREDITO, DEBITO, CHEQUE**
- VALENCHO MERCADO PAGO / FRANCISCO MERCADO PAGO → **TRANSFERENCIA, DEBITO**
- EFECTIVO → **EFECTIVO**

**Regla crítica:** NUNCA ejecutes registrar_gasto ni registrar_ingreso sin cuenta Y forma.

- Para un GASTO: si el usuario dice "pagué $5000 a Peirone", preguntá: "¿Desde qué cuenta y cómo? (efectivo / transferencia desde Santander / cheque / crédito / débito)". Si dice "efectivo" → cuenta EFECTIVO, forma EFECTIVO. Si dice "transferencia desde Santander" → preguntá cuál (Valencho o Francisco) y forma TRANSFERENCIA. Si dice "cheque" → cuenta SANTANDER VAL/FRA, forma CHEQUE.
- Para un INGRESO: si dice "cobré $80.000", preguntá "¿En qué cuenta y por qué medio? (Santander QR/crédito/débito, MP alias, efectivo)".

### Reglas de fechas

- Formato **DD/MM/AAAA**. Si dice "hoy" o no aclara, hoy.

### Política de carga

- Si faltan datos esenciales (cuenta, forma, monto, proveedor), pedilos antes. No inventes.
- Confirmá: "Listo: gasto de $5.000 a Peirone, EFECTIVO/EFECTIVO. Saldo nuevo: $X".

### Saludos y conversación

Si el mensaje no pide registrar nada, respondé sin tools. Sé breve y rioplatense.`;

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
  // 1) SF Gasto: actualizar "Preparar movimiento"
  const sf = await api("GET", `/workflows/${SF_GASTO_ID}`);
  const prep = sf.nodes.find((n) => n.name === "Preparar movimiento");
  if (!prep) throw new Error('SF Gasto: "Preparar movimiento" no encontrado');
  prep.parameters.jsCode = NEW_PREPARAR_CODE;
  await api("PUT", `/workflows/${SF_GASTO_ID}`, {
    name: sf.name, nodes: sf.nodes, connections: sf.connections,
    settings: sf.settings ?? { executionOrder: "v1" }, staticData: sf.staticData ?? null,
  });
  console.log("[OK] SF Gasto: ahora valida FORMAS DE EGRESO.");

  // 2) Padre: system prompt + tool registrar_gasto con descripción nueva
  const padre = await api("GET", `/workflows/${PADRE_ID}`);
  const agent = padre.nodes.find((n) => n.name === "AI Agent");
  agent.parameters.options = agent.parameters.options || {};
  agent.parameters.options.systemMessage = SYSTEM_PROMPT;

  const gasto = padre.nodes.find((n) => n.name === "registrar_gasto");
  gasto.parameters.description =
    "Registra un GASTO/EGRESO. Pide cuenta + forma DE PAGO. SANTANDER VAL/FRA → TRANSFERENCIA/CREDITO/DEBITO/CHEQUE; MERCADO PAGO VAL/FRA → TRANSFERENCIA/DEBITO; EFECTIVO → EFECTIVO.";
  gasto.parameters.workflowInputs.value.forma =
    "={{ $fromAI('forma', 'Forma de PAGO (egreso): TRANSFERENCIA, CREDITO, DEBITO, CHEQUE o EFECTIVO. Compatible con la cuenta.', 'string') }}";
  for (const f of gasto.parameters.workflowInputs.schema) {
    if (f.id === "forma") f.description = "TRANSFERENCIA, CREDITO, DEBITO, CHEQUE o EFECTIVO.";
  }

  const ingreso = padre.nodes.find((n) => n.name === "registrar_ingreso");
  ingreso.parameters.description =
    "Registra un INGRESO/COBRO. SANTANDER VAL/FRA → QR/CREDITO/DEBITO; MERCADO PAGO VAL/FRA → ALIAS; EFECTIVO → EFECTIVO.";

  await api("PUT", `/workflows/${PADRE_ID}`, {
    name: padre.name, nodes: padre.nodes, connections: padre.connections,
    settings: padre.settings ?? { executionOrder: "v1" }, staticData: padre.staticData ?? null,
  });
  console.log("[OK] Padre: system prompt + tools registrar_gasto/ingreso actualizadas.");
}
main().catch((e) => { console.error(e); process.exit(1); });
