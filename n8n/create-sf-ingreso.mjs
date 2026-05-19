/**
 * Indovina / n8n: crea (o actualiza) el subflow "SF – Indovina / Ingreso".
 *
 * Recibe: { cuenta, forma, monto, fecha, comentario, proveedor }
 * Acciones:
 *   1. Valida cuenta + forma según FORMAS_INGRESO_POR_CUENTA.
 *   2. Inserta fila en `movimientos` con monto POSITIVO (es ingreso).
 *   3. Inserta fila en `ingresos_desglose` (movimiento_id, cuenta, forma, monto).
 *   4. Suma saldo a la cuenta (descontar_saldo con monto negativo).
 *   5. Devuelve mensaje listo para Telegram.
 *
 * Uso: node n8n/create-sf-ingreso.mjs
 * Requiere en .env: N8N_API_URL, N8N_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Si ya existe un workflow con el mismo nombre, lo ACTUALIZA (no duplica).
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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!N8N_API_URL || !N8N_API_KEY) {
  console.error("Faltan N8N_API_URL o N8N_API_KEY en .env");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const WORKFLOW_NAME = "SF – Indovina / Ingreso";
const SUPABASE_CREDENTIAL_ID = "ba4qEQrLnOrIpzDf"; // Indovina Supabase API (de _sf-cheque.json)

async function api(method, urlPath, body) {
  const res = await fetch(`${N8N_API_URL}/api/v1${urlPath}`, {
    method,
    headers: { "X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} -> ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

const FORMAS_VALIDAS_JS = `
const FORMAS_POR_CUENTA = {
  "SANTANDER VALENCHO":      ["QR", "CREDITO", "DEBITO"],
  "SANTANDER FRANCISCO":     ["QR", "CREDITO", "DEBITO"],
  "VALENCHO MERCADO PAGO":   ["ALIAS"],
  "FRANCISCO MERCADO PAGO":  ["ALIAS"],
  "EFECTIVO":                ["EFECTIVO"],
};
`;

const PREPARAR_CODE = `${FORMAS_VALIDAS_JS}
const j = $input.first().json;
function fechaHoy() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
const cuenta = String(j.cuenta || '').trim().toUpperCase();
const forma  = String(j.forma  || '').trim().toUpperCase();
const formasValidas = FORMAS_POR_CUENTA[cuenta];
if (!formasValidas) throw new Error('Cuenta inválida: ' + cuenta);
if (!formasValidas.includes(forma)) {
  throw new Error('Forma "' + forma + '" no permitida para ' + cuenta + '. Válidas: ' + formasValidas.join(', '));
}
const monto = Math.abs(Number(j.monto));
if (!monto || isNaN(monto)) throw new Error('Monto inválido: ' + j.monto);
const fecha = String(j.fecha || '').trim() || fechaHoy();
const proveedor = String(j.proveedor || '').trim() || 'Venta';
const comentario = String(j.comentario || '').trim();
return [{
  json: {
    fecha,
    monto, // POSITIVO = ingreso
    proveedor,
    categoria: 'Ingreso',
    comentario,
    tipo_comprobante: '',
    numero_comprobante: '',
    fecha_vencimiento: '',
    origen: 'n8n',
    cuenta,
    _forma: forma,
    _monto: monto,
  }
}];`;

const DESGLOSE_CODE = `// Inserta fila en ingresos_desglose (movimiento_id = id del insert previo).
const prep = $('Preparar ingreso').item.json;
const inserted = $input.first().json;
// El nodo Supabase devuelve la fila insertada con su id.
const movimientoId = inserted.id ?? inserted?.[0]?.id;
if (!movimientoId) throw new Error('No vino id del movimiento insertado.');
return [{
  json: {
    movimiento_id: movimientoId,
    cuenta: prep.cuenta,
    forma: prep._forma,
    monto: prep._monto,
  }
}];`;

const SUMAR_SALDO_CODE = `const SUPABASE_URL = $env.SUPABASE_URL || "${SUPABASE_URL}";
const SUPABASE_KEY = $env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el env de n8n.');

const prep = $('Preparar ingreso').item.json;
const cuenta = prep.cuenta;
const monto = Math.abs(Number(prep._monto || 0));
const enc = encodeURIComponent(cuenta);
const baseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};
const rows = await this.helpers.httpRequest({
  method: 'GET',
  url: SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc + '&select=saldo',
  headers: baseHeaders,
  json: true,
});
if (!Array.isArray(rows) || rows.length === 0) throw new Error('Cuenta no existe: ' + cuenta);
const saldoActual = Number(rows[0].saldo) || 0;
const saldoNuevo = saldoActual + monto;
await this.helpers.httpRequest({
  method: 'PATCH',
  url: SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc,
  headers: { ...baseHeaders, Prefer: 'return=minimal' },
  body: { saldo: saldoNuevo },
  json: true,
});
return [{ json: { saldo: saldoNuevo, saldo_anterior: saldoActual, cuenta, monto } }];`;

const SALIDA_CODE = `const datos = $('Preparar ingreso').item.json;
const saldoResp = $('Sumar saldo cuenta').item.json;
const saldoNuevo = saldoResp?.saldo;
return [{ json: {
  ok: true,
  tipo: 'ingreso',
  output: 'Listo: ingreso de $' + datos._monto.toLocaleString('es-AR') + ' en ' + datos.cuenta + ' (' + datos._forma + ')' + (saldoNuevo != null ? '. Saldo nuevo: $' + Number(saldoNuevo).toLocaleString('es-AR') : '') + '.',
  datos
} }];`;

function buildWorkflow() {
  return {
    name: WORKFLOW_NAME,
    nodes: [
      {
        id: "in000001-0000-4000-8000-000000000001",
        name: "Start",
        type: "n8n-nodes-base.executeWorkflowTrigger",
        typeVersion: 1.1,
        position: [0, 0],
        parameters: { inputSource: "passthrough" },
      },
      {
        id: "in000001-0000-4000-8000-000000000002",
        name: "Preparar ingreso",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [220, 0],
        parameters: { jsCode: PREPARAR_CODE, mode: "runOnceForAllItems" },
      },
      {
        id: "in000001-0000-4000-8000-000000000003",
        name: "Insert movimiento Supabase",
        type: "n8n-nodes-base.supabase",
        typeVersion: 1,
        position: [460, 0],
        parameters: {
          useCustomSchema: false,
          resource: "row",
          operation: "create",
          tableId: "movimientos",
          dataToSend: "autoMapInputData",
          inputsToIgnore: "_forma, _monto",
        },
        credentials: {
          supabaseApi: { id: SUPABASE_CREDENTIAL_ID, name: "Indovina Supabase API" },
        },
      },
      {
        id: "in000001-0000-4000-8000-000000000004",
        name: "Preparar desglose",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [700, 0],
        parameters: { jsCode: DESGLOSE_CODE, mode: "runOnceForAllItems" },
      },
      {
        id: "in000001-0000-4000-8000-000000000005",
        name: "Insert desglose Supabase",
        type: "n8n-nodes-base.supabase",
        typeVersion: 1,
        position: [940, 0],
        parameters: {
          useCustomSchema: false,
          resource: "row",
          operation: "create",
          tableId: "ingresos_desglose",
          dataToSend: "autoMapInputData",
        },
        credentials: {
          supabaseApi: { id: SUPABASE_CREDENTIAL_ID, name: "Indovina Supabase API" },
        },
      },
      {
        id: "in000001-0000-4000-8000-000000000006",
        name: "Sumar saldo cuenta",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1180, 0],
        parameters: { jsCode: SUMAR_SALDO_CODE, mode: "runOnceForAllItems", language: "javaScript" },
      },
      {
        id: "in000001-0000-4000-8000-000000000007",
        name: "Salida subflujo",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1420, 0],
        parameters: { jsCode: SALIDA_CODE, mode: "runOnceForAllItems" },
      },
    ],
    connections: {
      Start:                        { main: [[{ node: "Preparar ingreso",          type: "main", index: 0 }]] },
      "Preparar ingreso":           { main: [[{ node: "Insert movimiento Supabase", type: "main", index: 0 }]] },
      "Insert movimiento Supabase": { main: [[{ node: "Preparar desglose",         type: "main", index: 0 }]] },
      "Preparar desglose":          { main: [[{ node: "Insert desglose Supabase",  type: "main", index: 0 }]] },
      "Insert desglose Supabase":   { main: [[{ node: "Sumar saldo cuenta",        type: "main", index: 0 }]] },
      "Sumar saldo cuenta":         { main: [[{ node: "Salida subflujo",           type: "main", index: 0 }]] },
    },
    settings: { executionOrder: "v1", callerPolicy: "workflowsFromSameOwner" },
  };
}

async function findExistingId() {
  const all = await api("GET", "/workflows?limit=250");
  const list = all?.data ?? all;
  const match = (Array.isArray(list) ? list : []).find((w) => w.name === WORKFLOW_NAME);
  return match?.id ?? null;
}

async function main() {
  const wf = buildWorkflow();
  const existingId = await findExistingId();
  if (existingId) {
    console.log(`[INFO] Workflow existe (${existingId}), actualizando.`);
    await api("PUT", `/workflows/${existingId}`, wf);
    console.log(`[OK] SF Ingreso actualizado. ID=${existingId}`);
    console.log(`[NEXT] Anotá este ID y pasalo a n8n/patch-parent-add-tool-ingreso.mjs si hace falta.`);
  } else {
    const created = await api("POST", "/workflows", wf);
    const id = created?.id ?? created?.data?.id;
    console.log(`[OK] SF Ingreso creado. ID=${id}`);
    console.log(`[NEXT] Anotá este ID — lo necesita patch-parent-add-tool-ingreso.mjs.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
