/**
 * Reemplaza el SF Factura foto (nT0MGKF7URJySwZM) por un pipeline real:
 *
 *   Start
 *     → OCR foto              (Code: binary→base64 + fetch OpenAI Vision + parseo)
 *     → ¿Es factura?          (IF)
 *         true:  → Insert facturas_proveedor Supabase
 *                 → Mirror Sheets proveedores (foto)
 *                 → Telegram OK
 *                 → Salida subflujo
 *         false: → Telegram no factura
 *                 → Salida no factura
 *
 * Idempotente: si ya existen los nodos nuevos (por id o nombre), los reemplaza.
 * Mantiene los nodos previos: Insert facturas_foto Supabase, Mirror Sheets,
 * Salida subflujo (los IDs/credenciales no se tocan).
 *
 * Borra el stub "Preparar fila".
 *
 * NOTA: requiere OPENAI_API_KEY como env var del contenedor n8n.
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
const env = { ...loadEnv(path.join(root, ".env")), ...loadEnv(path.join(root, ".env.local")) };
const base = (env.N8N_API_URL || "").replace(/\/$/, "");
const key = env.N8N_API_KEY;
if (!base || !key) throw new Error("Faltan N8N_API_URL y N8N_API_KEY en .env");

const SF_FOTO_ID = "nT0MGKF7URJySwZM";

const TELEGRAM_CRED_ID = "vIYEwFVlRVRV1GSK";
const TELEGRAM_CRED_NAME = "Telegram account";

const NAME_OCR = "OCR foto";
const NAME_IF = "¿Es factura?";
const NAME_INSERT_SB = "Insert facturas_foto Supabase";
const NAME_MIRROR = "Mirror Sheets proveedores (foto)";
const NAME_TG_OK = "Telegram OK";
const NAME_TG_NO_FACTURA = "Telegram no factura";
const NAME_SALIDA_OK = "Salida subflujo";
const NAME_SALIDA_NO = "Salida no factura";
const NAME_PREPARAR_FILA_VIEJO = "Preparar fila";

const ID_OCR = "c1000001-0001-4000-8000-000000000010";
const ID_IF = "c1000001-0001-4000-8000-000000000011";
const ID_TG_OK = "c1000001-0001-4000-8000-000000000012";
const ID_TG_NO = "c1000001-0001-4000-8000-000000000013";
const ID_SALIDA_NO = "c1000001-0001-4000-8000-000000000014";

const SYSTEM_PROMPT = `Sos asistente contable para Argentina. Analizás imágenes de comprobantes de proveedores.

Respondé SOLO un JSON válido (sin markdown) con esta forma EXACTA:
{
  "es_factura": boolean,
  "tipo_documento": "factura" | "remito" | "pedido" | "otro",
  "motivo_rechazo": "texto corto si NO es factura, vacío si sí",
  "proveedor": "razón social del emisor",
  "monto_total": número (TOTAL final con IVA y percepciones, NO subtotal),
  "fecha_emision": "dd/mm/aaaa",
  "fecha_vencimiento": "dd/mm/aaaa o vacío si solo figura condición de venta",
  "numero_factura": "número completo (ej. 0002-00098591)",
  "condicion_venta": "texto exacto que aparezca (ej. 'CUENTA CORRIENTE 15 DIAS', 'CONTADO', 'PAGO CONTADO')",
  "lineas": [ { "concepto": "ítem", "importe": número (subtotal del ítem) } ]
}

REGLAS CRÍTICAS:

1. Tipo de documento:
   - "factura" SOLO si la imagen muestra explícitamente la palabra "FACTURA" o "FACTURA A/B/C/M" en el encabezado. Es un comprobante fiscal con CUIT del emisor y CAE.
   - "remito" si dice "REMITO" o "DOCUMENTO NO VÁLIDO COMO FACTURA".
   - "pedido" si dice "PEDIDO", "NOTA DE PEDIDO", "ORDEN DE COMPRA".
   - "otro" para todo lo demás.
   - es_factura = true SOLO si tipo_documento = "factura".
   - Si NO es factura, completá motivo_rechazo con una frase clara (ej. "Es un remito, no una factura").

2. Monto total: usá SIEMPRE el TOTAL final (la cifra más grande, la que incluye IVA 21%/10.5% y percepciones). NO uses subtotal.

3. Fecha de emisión: la "Fecha" del comprobante (NO "Fecha de Vto. de CAE" — eso es AFIP, no pago).

4. Fecha de vencimiento:
   - Si figura EXPLÍCITAMENTE una "Fecha de Vto." de pago (distinta de la del CAE), ponéla.
   - Si solo figura condición tipo "Cuenta corriente 15 días" o "Contado", dejá fecha_vencimiento vacía y completá condicion_venta — el sistema la calcula después.
   - NUNCA uses la "Fecha de Vto. de CAE" como fecha_vencimiento.

5. Si la imagen está borrosa o no podés leer un campo, dejalo vacío en vez de inventar.`;

// Code del nodo "OCR foto" — runOnceForAllItems.
const OCR_CODE = `
const item = $input.all()[0];
if (!item) throw new Error('SF Factura foto: input vacío.');
const json = item.json || {};

const binaryProp = 'data';
const binary = item.binary && item.binary[binaryProp];
if (!binary) throw new Error('No hay binario en el item (esperado en binary.data).');

const buf = await this.helpers.getBinaryDataBuffer(0, binaryProp);
const b64 = buf.toString('base64');
const mime = binary.mimeType || 'image/jpeg';
const dataUrl = 'data:' + mime + ';base64,' + b64;

const apiKey = $env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Falta OPENAI_API_KEY como env var del contenedor n8n.');

const SYSTEM_PROMPT = ${JSON.stringify(SYSTEM_PROMPT)};

const res = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + apiKey,
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extraé los datos del comprobante siguiendo las reglas. JSON puro, sin markdown.' },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 1500,
    temperature: 0.1,
  }),
});

if (!res.ok) {
  const txt = await res.text();
  throw new Error('OpenAI ' + res.status + ': ' + txt.slice(0, 300));
}

const dataResp = await res.json();
const content = dataResp.choices && dataResp.choices[0] && dataResp.choices[0].message && dataResp.choices[0].message.content;
if (!content) throw new Error('Respuesta vacía de OpenAI');

const raw = JSON.parse(content);

const tipoRaw = String(raw.tipo_documento || '').toLowerCase().trim();
const tipo_documento = ['factura','remito','pedido'].indexOf(tipoRaw) >= 0 ? tipoRaw : 'otro';
const es_factura = !!raw.es_factura && tipo_documento === 'factura';

const fecha_emision = String(raw.fecha_emision || raw.fecha || '').trim();
const fecha_venc_explicita = String(raw.fecha_vencimiento || '').trim();
const condicion_venta = String(raw.condicion_venta || '').trim();

function sumDDMMYYYY(fecha, dias) {
  const parts = fecha.split('/');
  if (parts.length !== 3) return '';
  const d = Number(parts[0]); const m = Number(parts[1]); const y = Number(parts[2]);
  if (!d || !m || !y) return '';
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + dias);
  return String(date.getDate()).padStart(2,'0') + '/' + String(date.getMonth()+1).padStart(2,'0') + '/' + date.getFullYear();
}
function calcularVencimiento(fve, fe, c) {
  if (fve) return fve;
  if (!fe) return '';
  const cl = c.toLowerCase();
  if (/contado|efectivo|caja/.test(cl)) return fe;
  const m = cl.match(/(\\d{1,3})\\s*d[ií]as?/);
  if (m) return sumDDMMYYYY(fe, Number(m[1]));
  return '';
}

const fecha_vencimiento = calcularVencimiento(fecha_venc_explicita, fecha_emision, condicion_venta);
const proveedor = String(raw.proveedor || '').trim();
const monto = Math.abs(Number(raw.monto_total || raw.monto || 0)) || 0;
const numero_factura = String(raw.numero_factura || '').trim();
const motivo_rechazo = String(raw.motivo_rechazo || '').trim();

const d = new Date();
const hoy = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
const refBase = numero_factura || 'FOTO';
const referencia = (refBase + ' ' + hoy).trim();

const chat_id = json.chat_id || (json.message && json.message.chat && json.message.chat.id);

return [{
  json: {
    es_factura,
    tipo_documento,
    motivo_rechazo,
    proveedor,
    monto,
    fecha_emision,
    fecha_vencimiento,
    condicion_venta,
    numero_factura,
    referencia,
    foto_url: '',
    chat_id,
  },
  binary: item.binary,
}];
`.trim();

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

const wfUrl = `${base}/api/v1/workflows/${SF_FOTO_ID}`;
const wf = await api("GET", wfUrl);

const startNode = wf.nodes.find((n) => n.type === "n8n-nodes-base.executeWorkflowTrigger");
if (!startNode) throw new Error("No encontré el Start del SF.");
const insertNode = wf.nodes.find((n) => n.name === NAME_INSERT_SB);
if (!insertNode) throw new Error(`No encontré "${NAME_INSERT_SB}" en el SF.`);
const mirrorNode = wf.nodes.find((n) => n.name === NAME_MIRROR);
const salidaOkNode = wf.nodes.find((n) => n.name === NAME_SALIDA_OK);
if (!salidaOkNode) throw new Error(`No encontré "${NAME_SALIDA_OK}" en el SF.`);

// Reposicionar para que se vea claro.
startNode.position = [-200, 0];
insertNode.position = [600, -120];
if (mirrorNode) mirrorNode.position = [820, -120];
salidaOkNode.position = [1260, -120];

// Pasamos el insert a defineBelow con campos explícitos (más robusto que autoMapInputData).
insertNode.parameters = {
  ...(insertNode.parameters || {}),
  resource: "row",
  operation: "create",
  tableId: "facturas_proveedor",
  dataToSend: "defineBelow",
  fieldsUi: {
    fieldValues: [
      { fieldId: "referencia", fieldValue: "={{ $json.referencia }}" },
      { fieldId: "proveedor", fieldValue: "={{ $json.proveedor }}" },
      { fieldId: "monto", fieldValue: "={{ $json.monto }}" },
      { fieldId: "fecha_vencimiento", fieldValue: "={{ $json.fecha_vencimiento }}" },
      { fieldId: "foto_url", fieldValue: "={{ $json.foto_url }}" },
    ],
  },
  useCustomSchema: false,
};

// Mirror Sheets: ajustamos a defineBelow con valores explícitos
// (antes tenía mappingMode defineBelow con value vacío → no insertaba nada).
if (mirrorNode) {
  const schema = mirrorNode.parameters?.columns?.schema ?? [];
  mirrorNode.parameters = {
    ...(mirrorNode.parameters || {}),
    columns: {
      mappingMode: "defineBelow",
      value: {
        Referencia: "={{ $json.referencia }}",
        Proveedor: "={{ $json.proveedor }}",
        Monto: "={{ $json.monto }}",
        "Fecha vencimiento": "={{ $json.fecha_vencimiento }}",
      },
      matchingColumns: [],
      schema,
      attemptToConvertTypes: false,
      convertFieldsToString: true,
    },
  };
}

// Salida OK: dejamos un payload claro.
salidaOkNode.parameters = {
  ...(salidaOkNode.parameters || {}),
  jsCode: `return [{ json: { ok: true, tipo: 'factura_foto', datos: $json } }];`,
};

// Nodos nuevos.
const ocrNode = {
  id: ID_OCR,
  name: NAME_OCR,
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [40, 0],
  parameters: {
    mode: "runOnceForAllItems",
    language: "javaScript",
    jsCode: OCR_CODE,
  },
};

const ifNode = {
  id: ID_IF,
  name: NAME_IF,
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  position: [320, 0],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
      conditions: [
        {
          id: "if-es-factura",
          leftValue: "={{ $json.es_factura }}",
          rightValue: true,
          operator: { type: "boolean", operation: "equals" },
        },
      ],
      combinator: "and",
    },
    options: {},
  },
};

const tgOkNode = {
  id: ID_TG_OK,
  name: NAME_TG_OK,
  type: "n8n-nodes-base.telegram",
  typeVersion: 1.2,
  position: [1040, -120],
  parameters: {
    resource: "message",
    operation: "sendMessage",
    chatId: "={{ $('OCR foto').item.json.chat_id }}",
    text:
      "={{ '✅ Factura registrada\\n' + ($('OCR foto').item.json.proveedor || '(sin proveedor)') + '\\nMonto: $' + ($('OCR foto').item.json.monto || 0) + ($('OCR foto').item.json.fecha_vencimiento ? ('\\nVence: ' + $('OCR foto').item.json.fecha_vencimiento) : '') + ($('OCR foto').item.json.numero_factura ? ('\\nN°: ' + $('OCR foto').item.json.numero_factura) : '') }}",
    additionalFields: {},
  },
  credentials: {
    telegramApi: { id: TELEGRAM_CRED_ID, name: TELEGRAM_CRED_NAME },
  },
};

const tgNoFacturaNode = {
  id: ID_TG_NO,
  name: NAME_TG_NO_FACTURA,
  type: "n8n-nodes-base.telegram",
  typeVersion: 1.2,
  position: [600, 160],
  parameters: {
    resource: "message",
    operation: "sendMessage",
    chatId: "={{ $('OCR foto').item.json.chat_id }}",
    text:
      "={{ '❌ La foto no parece una factura fiscal (' + ($('OCR foto').item.json.tipo_documento || 'otro') + ').' + ($('OCR foto').item.json.motivo_rechazo ? ('\\n' + $('OCR foto').item.json.motivo_rechazo) : '') + '\\nMandame la factura A/B/C/M oficial.' }}",
    additionalFields: {},
  },
  credentials: {
    telegramApi: { id: TELEGRAM_CRED_ID, name: TELEGRAM_CRED_NAME },
  },
};

const salidaNoNode = {
  id: ID_SALIDA_NO,
  name: NAME_SALIDA_NO,
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [820, 160],
  parameters: {
    mode: "runOnceForAllItems",
    language: "javaScript",
    jsCode:
      "return [{ json: { ok: false, tipo: 'no_factura', datos: $('OCR foto').item.json } }];",
  },
};

// Limpiar nodos viejos (stub) y los nuevos por si re-aplicamos.
const dropNames = new Set([
  NAME_PREPARAR_FILA_VIEJO,
  NAME_OCR,
  NAME_IF,
  NAME_TG_OK,
  NAME_TG_NO_FACTURA,
  NAME_SALIDA_NO,
]);
const dropIds = new Set([ID_OCR, ID_IF, ID_TG_OK, ID_TG_NO, ID_SALIDA_NO]);

const nodes = wf.nodes
  .filter((n) => !dropNames.has(n.name) && !dropIds.has(n.id))
  .concat([ocrNode, ifNode, tgOkNode, tgNoFacturaNode, salidaNoNode]);

// Conexiones nuevas, descartando todo lo previo.
const connections = {
  [startNode.name]: { main: [[{ node: NAME_OCR, type: "main", index: 0 }]] },
  [NAME_OCR]: { main: [[{ node: NAME_IF, type: "main", index: 0 }]] },
  [NAME_IF]: {
    main: [
      [{ node: NAME_INSERT_SB, type: "main", index: 0 }], // true
      [{ node: NAME_TG_NO_FACTURA, type: "main", index: 0 }], // false
    ],
  },
  [NAME_INSERT_SB]: mirrorNode
    ? { main: [[{ node: NAME_MIRROR, type: "main", index: 0 }]] }
    : { main: [[{ node: NAME_TG_OK, type: "main", index: 0 }]] },
  ...(mirrorNode
    ? { [NAME_MIRROR]: { main: [[{ node: NAME_TG_OK, type: "main", index: 0 }]] } }
    : {}),
  [NAME_TG_OK]: { main: [[{ node: NAME_SALIDA_OK, type: "main", index: 0 }]] },
  [NAME_TG_NO_FACTURA]: { main: [[{ node: NAME_SALIDA_NO, type: "main", index: 0 }]] },
  [NAME_SALIDA_OK]: { main: [[]] },
  [NAME_SALIDA_NO]: { main: [[]] },
};

const putBody = {
  name: wf.name,
  nodes,
  connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
};

const updated = await api("PUT", wfUrl, putBody);
console.log("OK SF foto:", updated.id, "| nodes:", updated.nodes?.length);
