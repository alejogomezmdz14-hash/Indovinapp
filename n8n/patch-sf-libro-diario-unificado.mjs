/**
 * Convierte el SF Gasto (OcPG64aOIccaaEZW) en "SF – Indovina / Libro diario":
 *  un único subflow para INGRESOS y EGRESOS.
 *
 * Recibe: { tipo: 'ingreso'|'egreso', cuenta, forma, monto, proveedor, fecha?, comentario? }
 *
 * Acciones:
 *  1. Valida cuenta+forma según tipo (FORMAS_INGRESO o FORMAS_EGRESO).
 *  2. Insert en `movimientos` (monto positivo si ingreso, negativo si egreso).
 *  3. Si ingreso → insert también en `ingresos_desglose`.
 *  4. Actualiza saldo de la cuenta (suma o resta según tipo).
 *  5. Mirror al Sheet "Libro diario" con el nuevo formato (9 columnas).
 *  6. Devuelve mensaje de confirmación.
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
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SHEET_ID = env.GOOGLE_SHEET_ID;
const SF_ID = "OcPG64aOIccaaEZW";
const SUPABASE_CRED_ID = "ba4qEQrLnOrIpzDf";
const GOOGLE_CRED_ID = "IR5D8tfAlpwgHXkz";

const PREPARAR_CODE = `const FORMAS_INGRESO = {
  "SANTANDER VALENCHO":     ["QR","CREDITO","DEBITO"],
  "SANTANDER FRANCISCO":    ["QR","CREDITO","DEBITO"],
  "VALENCHO MERCADO PAGO":  ["ALIAS"],
  "FRANCISCO MERCADO PAGO": ["ALIAS"],
  "EFECTIVO":               ["EFECTIVO"],
};
const FORMAS_EGRESO = {
  "SANTANDER VALENCHO":     ["TRANSFERENCIA","CREDITO","DEBITO","CHEQUE"],
  "SANTANDER FRANCISCO":    ["TRANSFERENCIA","CREDITO","DEBITO","CHEQUE"],
  "VALENCHO MERCADO PAGO":  ["TRANSFERENCIA","DEBITO"],
  "FRANCISCO MERCADO PAGO": ["TRANSFERENCIA","DEBITO"],
  "EFECTIVO":               ["EFECTIVO"],
};
function fechaHoy() {
  const d = new Date();
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
}
const j = $input.first().json;
const tipo = String(j.tipo || '').trim().toLowerCase();
if (tipo !== 'ingreso' && tipo !== 'egreso') {
  throw new Error('tipo inválido (esperado "ingreso" o "egreso"): ' + j.tipo);
}
const cuenta = String(j.cuenta || '').trim().toUpperCase();
const forma  = String(j.forma  || '').trim().toUpperCase();
const FORMAS = tipo === 'ingreso' ? FORMAS_INGRESO : FORMAS_EGRESO;
const formasValidas = FORMAS[cuenta];
if (!formasValidas) throw new Error('Cuenta inválida: ' + cuenta + '. Cuentas: ' + Object.keys(FORMAS).join(', '));
if (!formasValidas.includes(forma)) {
  throw new Error('Forma "' + forma + '" no permitida para ' + cuenta + ' (' + tipo + '). Válidas: ' + formasValidas.join(', '));
}
const montoAbs = Math.abs(Number(j.monto));
if (!montoAbs || isNaN(montoAbs)) throw new Error('Monto inválido: ' + j.monto);
const proveedor = String(j.proveedor || '').trim() || (tipo === 'ingreso' ? 'Venta' : 'sin especificar');
const comentario = String(j.comentario || '').trim();
const categoria = String(j.categoria || '').trim() || (tipo === 'ingreso' ? 'Ingreso' : 'Gasto');
const fecha = String(j.fecha || '').trim() || fechaHoy();
const signed = tipo === 'ingreso' ? montoAbs : -montoAbs;
return [{
  json: {
    tipo,
    cuenta,
    forma,
    fecha,
    monto: signed,
    monto_abs: montoAbs,
    proveedor,
    categoria,
    comentario,
    tipo_comprobante: '',
    numero_comprobante: '',
    fecha_vencimiento: '',
    origen: 'n8n',
  }
}];`;

const INSERT_MOV_CODE = `const SUPABASE_URL = "${SB_URL}";
const SUPABASE_KEY = "${SB_KEY}";
const prep = $('Preparar movimiento').item.json;
const baseHeaders = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

// Pre-check: existe la columna 'forma' en movimientos?
let formaExists = false;
try {
  const probe = await this.helpers.httpRequest({
    method: 'GET',
    url: SUPABASE_URL + '/rest/v1/movimientos?select=forma&limit=1',
    headers: baseHeaders, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true,
  });
  formaExists = probe.statusCode === 200;
} catch (_) { formaExists = false; }

const payload = {
  fecha: prep.fecha,
  monto: prep.monto,
  proveedor: prep.proveedor,
  categoria: prep.categoria,
  comentario: prep.comentario,
  tipo_comprobante: '',
  numero_comprobante: '',
  fecha_vencimiento: '',
  origen: prep.origen,
  cuenta: prep.cuenta,
};
if (formaExists && prep.forma) payload.forma = prep.forma;

const res = await this.helpers.httpRequest({
  method: 'POST',
  url: SUPABASE_URL + '/rest/v1/movimientos',
  headers: { ...baseHeaders, Prefer: 'return=representation' },
  body: payload, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true,
});
if (res.statusCode < 200 || res.statusCode >= 300) {
  const b = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
  throw new Error('Insert movimientos ' + res.statusCode + ': ' + b);
}
const row = Array.isArray(res.body) ? res.body[0] : res.body;
return [{ json: row }];`;

const INSERT_DESGLOSE_CODE = `const SUPABASE_URL = "${SB_URL}";
const SUPABASE_KEY = "${SB_KEY}";
const prep = $('Preparar movimiento').item.json;
const mov = $input.first().json;

// Solo insertar desglose si es INGRESO.
if (prep.tipo !== 'ingreso') {
  return [{ json: { skipped: true, mov_id: mov.id } }];
}

const res = await this.helpers.httpRequest({
  method: 'POST',
  url: SUPABASE_URL + '/rest/v1/ingresos_desglose',
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  body: { movimiento_id: mov.id, cuenta: prep.cuenta, forma: prep.forma, monto: prep.monto_abs },
  json: true, returnFullResponse: true, ignoreHttpStatusErrors: true,
});
if (res.statusCode < 200 || res.statusCode >= 300) {
  const b = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
  throw new Error('Insert desglose ' + res.statusCode + ': ' + b);
}
return [{ json: { ok: true, mov_id: mov.id } }];`;

const SALDO_CODE = `const SUPABASE_URL = "${SB_URL}";
const SUPABASE_KEY = "${SB_KEY}";
const prep = $('Preparar movimiento').item.json;
const cuenta = prep.cuenta;
const delta = prep.monto; // positivo (ingreso) o negativo (egreso)
const enc = encodeURIComponent(cuenta);
const baseHeaders = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

const getR = await this.helpers.httpRequest({
  method: 'GET',
  url: SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc + '&select=saldo',
  headers: baseHeaders, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true,
});
if (getR.statusCode !== 200) throw new Error('GET saldo ' + getR.statusCode);
const rows = getR.body;
if (!Array.isArray(rows) || rows.length === 0) throw new Error('Cuenta no existe: ' + cuenta);
const saldoAnt = Number(rows[0].saldo) || 0;
const saldoNuevo = saldoAnt + delta;

const patchR = await this.helpers.httpRequest({
  method: 'PATCH',
  url: SUPABASE_URL + '/rest/v1/cuentas?nombre=eq.' + enc,
  headers: { ...baseHeaders, Prefer: 'return=minimal' },
  body: { saldo: saldoNuevo }, json: true, returnFullResponse: true, ignoreHttpStatusErrors: true,
});
if (patchR.statusCode !== 204 && patchR.statusCode !== 200) {
  throw new Error('PATCH saldo ' + patchR.statusCode);
}
return [{ json: { cuenta, saldo: saldoNuevo, saldo_anterior: saldoAnt, delta } }];`;

const SALIDA_CODE = `const prep = $('Preparar movimiento').item.json;
const saldoResp = $('Actualizar saldo cuenta').item.json;
const saldoNuevo = saldoResp?.saldo;
const verbo = prep.tipo === 'ingreso' ? 'ingreso' : 'gasto';
const accion = prep.tipo === 'ingreso' ? 'cobrado en' : 'pagado desde';
const partes = [
  'Listo: ' + verbo + ' de $' + prep.monto_abs.toLocaleString('es-AR'),
  accion + ' ' + prep.cuenta + ' / ' + prep.forma,
];
if (prep.proveedor && prep.proveedor !== 'sin especificar' && prep.proveedor !== 'Venta') {
  partes.push('(' + prep.proveedor + ')');
}
if (saldoNuevo != null) partes.push('· Saldo: $' + Number(saldoNuevo).toLocaleString('es-AR'));
return [{ json: { ok: true, tipo: verbo, output: partes.join(' ') + '.', datos: prep } }];`;

function buildWorkflow(existing) {
  const nodes = [
    {
      id: "lb000001-0000-4000-8000-000000000001",
      name: "Start",
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 0],
      parameters: { inputSource: "passthrough" },
    },
    {
      id: "lb000001-0000-4000-8000-000000000002",
      name: "Preparar movimiento",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
      parameters: { jsCode: PREPARAR_CODE, mode: "runOnceForAllItems" },
    },
    {
      id: "lb000001-0000-4000-8000-000000000003",
      name: "Insert movimientos Supabase",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [460, 0],
      parameters: { jsCode: INSERT_MOV_CODE, mode: "runOnceForAllItems", language: "javaScript" },
    },
    {
      id: "lb000001-0000-4000-8000-000000000004",
      name: "Insert desglose si ingreso",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [700, 0],
      parameters: { jsCode: INSERT_DESGLOSE_CODE, mode: "runOnceForAllItems", language: "javaScript" },
    },
    {
      id: "lb000001-0000-4000-8000-000000000005",
      name: "Actualizar saldo cuenta",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [940, 0],
      parameters: { jsCode: SALDO_CODE, mode: "runOnceForAllItems", language: "javaScript" },
    },
    {
      id: "lb000001-0000-4000-8000-000000000006",
      name: "Mirror Sheets Libro diario",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.7,
      position: [1180, 0],
      parameters: {
        resource: "sheet",
        operation: "append",
        documentId: { __rl: true, mode: "id", value: SHEET_ID },
        sheetName:  { __rl: true, mode: "name", value: "Libro diario" },
        columns: {
          mappingMode: "defineBelow",
          value: {
            "Fecha ":                     "={{ $('Preparar movimiento').item.json.fecha }}",
            "categoria":                  "={{ $('Preparar movimiento').item.json.categoria }}",
            "Detalle de los movimiento s":"={{ $('Preparar movimiento').item.json.proveedor }}{{ $('Preparar movimiento').item.json.comentario ? ' - ' + $('Preparar movimiento').item.json.comentario : '' }}",
            "ingresos":                   "={{ $('Preparar movimiento').item.json.tipo === 'ingreso' ? $('Preparar movimiento').item.json.monto_abs : '' }}",
            "egresos":                    "={{ $('Preparar movimiento').item.json.tipo === 'egreso'  ? $('Preparar movimiento').item.json.monto_abs : '' }}",
            "medio de ingreso":           "={{ $('Preparar movimiento').item.json.tipo === 'ingreso' ? $('Preparar movimiento').item.json.forma : '' }}",
            "medio de egreso ":           "={{ $('Preparar movimiento').item.json.tipo === 'egreso'  ? $('Preparar movimiento').item.json.forma : '' }}",
          },
        },
        options: {},
        authentication: "serviceAccount",
      },
      continueOnFail: true,
      credentials: {
        googleApi: { id: GOOGLE_CRED_ID, name: "Indovina Google Service Account" },
      },
    },
    {
      id: "lb000001-0000-4000-8000-000000000007",
      name: "Salida subflujo",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1420, 0],
      parameters: { jsCode: SALIDA_CODE, mode: "runOnceForAllItems" },
    },
  ];

  const connections = {
    Start:                         { main: [[{ node: "Preparar movimiento",          type: "main", index: 0 }]] },
    "Preparar movimiento":         { main: [[{ node: "Insert movimientos Supabase",  type: "main", index: 0 }]] },
    "Insert movimientos Supabase": { main: [[{ node: "Insert desglose si ingreso",   type: "main", index: 0 }]] },
    "Insert desglose si ingreso":  { main: [[{ node: "Actualizar saldo cuenta",      type: "main", index: 0 }]] },
    "Actualizar saldo cuenta":     { main: [[{ node: "Mirror Sheets Libro diario",   type: "main", index: 0 }]] },
    "Mirror Sheets Libro diario":  { main: [[{ node: "Salida subflujo",              type: "main", index: 0 }]] },
  };

  return {
    name: "SF – Indovina / Libro diario",
    nodes,
    connections,
    settings: existing?.settings ?? { executionOrder: "v1", callerPolicy: "workflowsFromSameOwner" },
    staticData: existing?.staticData ?? null,
  };
}

async function api(method, p, body) {
  const r = await fetch(`${URL}/api/v1${p}`, {
    method,
    headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t.slice(0, 800)}`);
  return t ? JSON.parse(t) : null;
}

async function main() {
  const existing = await api("GET", `/workflows/${SF_ID}`);
  const payload = buildWorkflow(existing);
  await api("PUT", `/workflows/${SF_ID}`, payload);
  console.log("[OK] SF Libro diario unificado guardado (id=" + SF_ID + ").");
  console.log("[OK] Mirror Sheets restaurado al nuevo formato (9 columnas).");
}
main().catch((e) => { console.error(e); process.exit(1); });
