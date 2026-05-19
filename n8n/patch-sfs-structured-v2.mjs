/**
 * Indovina — Patch SFs (Gasto, Cheque, Factura proveedor) v2:
 *  • El Code "Preparar fila/movimiento" YA NO parsea texto.
 *    Toma directamente los inputs estructurados que pasa el AI Agent.
 *  • SF Gasto agrega un HTTP Request → RPC descontar_saldo después del insert.
 *  • SF Cheque y Factura proveedor: solo ajustan el Code para tomar inputs limpios.
 *
 * NO toca SF Factura foto (se reescribe en otro patch).
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

const SUPABASE_URL_PUBLIC = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");

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

const CUENTAS_VALIDAS = [
  "VALENCHO MERCADO PAGO 1",
  "VALENCHO MERCADO PAGO 2",
  "VALENCHO SANTANDER",
  "FRANCISCO MERCADO PAGO",
  "FRANCISCO SANTANDER",
  "EFECTIVO",
];

// =============================================================================
// SF GASTO  (OcPG64aOIccaaEZW)
// =============================================================================

const codeGasto = `const j = $input.first().json;
const cuentas = ${JSON.stringify(CUENTAS_VALIDAS)};

function fechaHoy() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

const cuentaIn = String(j.cuenta || '').trim().toUpperCase();
const cuenta = cuentas.includes(cuentaIn) ? cuentaIn : '';
if (!cuenta) {
  throw new Error('Cuenta inválida: ' + cuentaIn + '. Cuentas válidas: ' + cuentas.join(', '));
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
    _monto_positivo: monto
  }
}];`;

const supabaseInsertMovimientoNode = (id, position, cred) => ({
  id,
  name: "Insert movimientos Supabase",
  type: "n8n-nodes-base.supabase",
  typeVersion: 1,
  position,
  parameters: {
    useCustomSchema: false,
    resource: "row",
    operation: "create",
    tableId: "movimientos",
    dataToSend: "autoMapInputData",
    inputsToIgnore: "cuenta, _monto_positivo",
  },
  credentials: { supabaseApi: cred },
});

const rpcDescontarSaldoNode = (id, position) => ({
  id,
  name: "Descontar saldo cuenta",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.4,
  position,
  parameters: {
    method: "POST",
    url: `${SUPABASE_URL_PUBLIC}/rest/v1/rpc/descontar_saldo`,
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "apikey", value: "={{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Authorization", value: "={{ 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Content-Type", value: "application/json" },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ JSON.stringify({ p_cuenta: $('Preparar movimiento').item.json.cuenta, p_monto: $('Preparar movimiento').item.json._monto_positivo }) }}",
    options: {},
  },
});

const sheetsAppendLibroDiarioNode = (id, position, googleCred) => ({
  id,
  name: "Mirror Sheets libro diario",
  type: "n8n-nodes-base.googleSheets",
  typeVersion: 4.7,
  position,
  parameters: {
    resource: "sheet",
    operation: "append",
    documentId: { __rl: true, mode: "id", value: "={{ $env.GOOGLE_SHEET_ID }}" },
    sheetName: { __rl: true, mode: "name", value: "Libro diario" },
    range: "A:H",
    columns: {
      mappingMode: "defineBelow",
      value: {
        Fecha: "={{ $('Preparar movimiento').item.json.fecha }}",
        Monto: "={{ $('Preparar movimiento').item.json.monto }}",
        Proveedor: "={{ $('Preparar movimiento').item.json.proveedor }}",
        Categoria: "={{ $('Preparar movimiento').item.json.categoria }}",
        Comentario: "={{ $('Preparar movimiento').item.json.comentario }}",
        "Tipo comprobante": "={{ $('Preparar movimiento').item.json.tipo_comprobante }}",
        "Numero comprobante": "={{ $('Preparar movimiento').item.json.numero_comprobante }}",
        "Fecha vencimiento": "={{ $('Preparar movimiento').item.json.fecha_vencimiento }}",
      },
    },
    options: {},
  },
  continueOnFail: true,
  credentials: { googleApi: googleCred },
});

const salidaGastoNode = (id, position) => ({
  id,
  name: "Salida subflujo",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position,
  parameters: {
    jsCode: `const datos = $('Preparar movimiento').item.json;
const saldoResp = $('Descontar saldo cuenta').item.json;
const saldoNuevo = typeof saldoResp === 'number' ? saldoResp : (Array.isArray(saldoResp) ? saldoResp[0] : null);
return [{ json: {
  ok: true,
  tipo: 'gasto',
  output: 'Listo: gasto de $' + datos._monto_positivo.toLocaleString('es-AR') + ' en ' + datos.proveedor + ', cuenta ' + datos.cuenta + (saldoNuevo != null ? '. Saldo nuevo: $' + Number(saldoNuevo).toLocaleString('es-AR') : '') + '.',
  datos
} }];`,
    mode: "runOnceForAllItems",
  },
});

// =============================================================================
// Genérico para Cheque / Factura proveedor
// =============================================================================

const codeChequeOFactura = (tipoLabel) => `const j = $input.first().json;
function fechaHoy() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
const proveedor = String(j.proveedor || '').trim();
if (!proveedor) throw new Error('Falta proveedor');
const monto = Math.abs(Number(j.monto));
if (!monto || isNaN(monto)) throw new Error('Monto inválido: ' + j.monto);
const fecha_vencimiento = String(j.fecha_vencimiento || '').trim() || fechaHoy();
const referencia = String(j.referencia || '').trim();
return [{ json: { referencia, proveedor, monto, fecha_vencimiento, foto_url: '' } }];`;

const supabaseInsertGenericoNode = (id, position, name, tableId, cred) => ({
  id,
  name,
  type: "n8n-nodes-base.supabase",
  typeVersion: 1,
  position,
  parameters: {
    useCustomSchema: false,
    resource: "row",
    operation: "create",
    tableId,
    dataToSend: "autoMapInputData",
    inputsToIgnore: "",
  },
  credentials: { supabaseApi: cred },
});

const sheetsAppendGenericoNode = (id, position, name, sheetName, columns, googleCred) => ({
  id,
  name,
  type: "n8n-nodes-base.googleSheets",
  typeVersion: 4.7,
  position,
  parameters: {
    resource: "sheet",
    operation: "append",
    documentId: { __rl: true, mode: "id", value: "={{ $env.GOOGLE_SHEET_ID }}" },
    sheetName: { __rl: true, mode: "name", value: sheetName },
    range: sheetName === "proveedores" ? "A:E" : "A:D",
    columns: { mappingMode: "defineBelow", value: columns },
    options: {},
  },
  continueOnFail: true,
  credentials: { googleApi: googleCred },
});

const salidaGenericaNode = (id, position, tipo, label) => ({
  id,
  name: "Salida subflujo",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position,
  parameters: {
    jsCode: `const datos = $('Preparar fila').item.json;
return [{ json: {
  ok: true,
  tipo: '${tipo}',
  output: 'Listo: ${label} de $' + datos.monto.toLocaleString('es-AR') + ' a ' + datos.proveedor + (datos.fecha_vencimiento ? ' (vence ' + datos.fecha_vencimiento + ')' : '') + '.',
  datos
} }];`,
    mode: "runOnceForAllItems",
  },
});

// =============================================================================
// Detectar credenciales existentes leyendo el SF Gasto actual
// =============================================================================

async function detectCredentials() {
  const gasto = await api("GET", `${base}/api/v1/workflows/OcPG64aOIccaaEZW`);
  const supaNode = gasto.nodes.find((n) => n.type === "n8n-nodes-base.supabase");
  const gsNode = gasto.nodes.find((n) => n.type === "n8n-nodes-base.googleSheets");
  const supaCred = supaNode?.credentials?.supabaseApi;
  const gsCred = gsNode?.credentials?.googleApi;
  if (!supaCred?.id) throw new Error("No encontré la credencial Supabase en SF Gasto");
  if (!gsCred?.id) throw new Error("No encontré la credencial Google API en SF Gasto");
  return { supaCred, gsCred };
}

// =============================================================================
// Aplicar
// =============================================================================

const { supaCred, gsCred } = await detectCredentials();
console.log("Credenciales detectadas: Supabase=" + supaCred.name + ", Google=" + gsCred.name);

// -- SF Gasto -----------------------------------------------------------------
{
  const wfId = "OcPG64aOIccaaEZW";
  const url = `${base}/api/v1/workflows/${wfId}`;
  const wf = await api("GET", url);

  const nodes = [
    {
      id: "b1000001-0000-4000-8000-000000000001",
      name: "Start",
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 0],
      parameters: { inputSource: "passthrough" },
    },
    {
      id: "b1000001-0000-4000-8000-000000000003",
      name: "Preparar movimiento",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
      parameters: { jsCode: codeGasto, mode: "runOnceForAllItems" },
    },
    supabaseInsertMovimientoNode(
      "b1000001-0000-4000-8000-000000000004",
      [460, 0],
      supaCred,
    ),
    rpcDescontarSaldoNode("b1000001-0000-4000-8000-000000000005", [700, 0]),
    sheetsAppendLibroDiarioNode(
      "d2000001-0000-4000-8000-000000000001",
      [940, 0],
      gsCred,
    ),
    salidaGastoNode("f3aaaaaa-0000-4000-8000-000000000001", [1180, 0]),
  ];

  const connections = {
    Start: { main: [[{ node: "Preparar movimiento", type: "main", index: 0 }]] },
    "Preparar movimiento": {
      main: [[{ node: "Insert movimientos Supabase", type: "main", index: 0 }]],
    },
    "Insert movimientos Supabase": {
      main: [[{ node: "Descontar saldo cuenta", type: "main", index: 0 }]],
    },
    "Descontar saldo cuenta": {
      main: [[{ node: "Mirror Sheets libro diario", type: "main", index: 0 }]],
    },
    "Mirror Sheets libro diario": {
      main: [[{ node: "Salida subflujo", type: "main", index: 0 }]],
    },
  };

  await api("PUT", url, {
    name: wf.name,
    nodes,
    connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("✓ SF Gasto actualizado (con descontar_saldo)");
}

// -- SF Cheque ----------------------------------------------------------------
{
  const wfId = "iOAvoQaSdY7OmNHt";
  const url = `${base}/api/v1/workflows/${wfId}`;
  const wf = await api("GET", url);

  const nodes = [
    {
      id: "c1000001-0000-4000-8000-000000000001",
      name: "Start",
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 0],
      parameters: { inputSource: "passthrough" },
    },
    {
      id: "c1000001-0000-4000-8000-000000000003",
      name: "Preparar fila",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
      parameters: { jsCode: codeChequeOFactura("Cheque"), mode: "runOnceForAllItems" },
    },
    supabaseInsertGenericoNode(
      "c1000001-0000-4000-8000-000000000004",
      [460, 0],
      "Insert cheques Supabase",
      "cheques",
      supaCred,
    ),
    sheetsAppendGenericoNode(
      "d2000001-0000-4000-8000-000000000002",
      [700, 0],
      "Mirror Sheets cheques",
      "cheques",
      {
        Referencia: "={{ $('Preparar fila').item.json.referencia }}",
        Proveedor: "={{ $('Preparar fila').item.json.proveedor }}",
        Monto: "={{ $('Preparar fila').item.json.monto }}",
        "Fecha vencimiento": "={{ $('Preparar fila').item.json.fecha_vencimiento }}",
      },
      gsCred,
    ),
    salidaGenericaNode("f3aaaaaa-0000-4000-8000-000000000002", [940, 0], "cheque", "cheque"),
  ];

  const connections = {
    Start: { main: [[{ node: "Preparar fila", type: "main", index: 0 }]] },
    "Preparar fila": {
      main: [[{ node: "Insert cheques Supabase", type: "main", index: 0 }]],
    },
    "Insert cheques Supabase": {
      main: [[{ node: "Mirror Sheets cheques", type: "main", index: 0 }]],
    },
    "Mirror Sheets cheques": {
      main: [[{ node: "Salida subflujo", type: "main", index: 0 }]],
    },
  };

  await api("PUT", url, {
    name: wf.name,
    nodes,
    connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("✓ SF Cheque actualizado");
}

// -- SF Factura proveedor -----------------------------------------------------
{
  const wfId = "CFovQKG2RvJ7OEFB";
  const url = `${base}/api/v1/workflows/${wfId}`;
  const wf = await api("GET", url);

  const nodes = [
    {
      id: "c1000001-0000-4000-8000-000000000001",
      name: "Start",
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 0],
      parameters: { inputSource: "passthrough" },
    },
    {
      id: "c1000001-0000-4000-8000-000000000003",
      name: "Preparar fila",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
      parameters: {
        jsCode: codeChequeOFactura("Factura proveedor"),
        mode: "runOnceForAllItems",
      },
    },
    supabaseInsertGenericoNode(
      "c1000001-0000-4000-8000-000000000004",
      [460, 0],
      "Insert facturas_proveedor Supabase",
      "facturas_proveedor",
      supaCred,
    ),
    sheetsAppendGenericoNode(
      "d2000001-0000-4000-8000-000000000003",
      [700, 0],
      "Mirror Sheets proveedores",
      "proveedores",
      {
        Referencia: "={{ $('Preparar fila').item.json.referencia }}",
        Proveedor: "={{ $('Preparar fila').item.json.proveedor }}",
        Monto: "={{ $('Preparar fila').item.json.monto }}",
        "Fecha vencimiento": "={{ $('Preparar fila').item.json.fecha_vencimiento }}",
        foto_url: "={{ $('Preparar fila').item.json.foto_url }}",
      },
      gsCred,
    ),
    salidaGenericaNode(
      "f3aaaaaa-0000-4000-8000-000000000003",
      [940, 0],
      "factura_proveedor",
      "factura proveedor",
    ),
  ];

  const connections = {
    Start: { main: [[{ node: "Preparar fila", type: "main", index: 0 }]] },
    "Preparar fila": {
      main: [[{ node: "Insert facturas_proveedor Supabase", type: "main", index: 0 }]],
    },
    "Insert facturas_proveedor Supabase": {
      main: [[{ node: "Mirror Sheets proveedores", type: "main", index: 0 }]],
    },
    "Mirror Sheets proveedores": {
      main: [[{ node: "Salida subflujo", type: "main", index: 0 }]],
    },
  };

  await api("PUT", url, {
    name: wf.name,
    nodes,
    connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("✓ SF Factura proveedor actualizado");
}

console.log("\nListo. Ahora aplicá la migración SQL 004_descontar_saldo.sql en Supabase.");
