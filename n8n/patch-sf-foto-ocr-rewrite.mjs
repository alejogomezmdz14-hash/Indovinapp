/**
 * Reescribe COMPLETAMENTE el jsCode del nodo "OCR foto" del SF Factura foto.
 * El patch anterior con regex corrompió el code (línea 14 SyntaxError).
 * Esto es la versión limpia con apiKey hardcoded inline.
 */
import fs from "node:fs";
const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const base = env.N8N_API_URL.replace(/\/$/, "");
const key = env.N8N_API_KEY;
const OPENAI_API_KEY = env.OPENAI_API_KEY;

async function api(method, url, body) {
  const opts = { method, headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

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
  "condicion_venta": "texto exacto que aparezca",
  "lineas": [ { "concepto": "ítem", "importe": número } ]
}

REGLAS:
1. tipo_documento = "factura" SOLO si dice "FACTURA A/B/C/M" en el encabezado.
2. Si NO es factura, completá motivo_rechazo.
3. monto_total = TOTAL final (con IVA y percepciones), NO subtotal.
4. fecha_emision = "Fecha" del comprobante (NO Fecha de Vto. de CAE).
5. Si solo figura condición ("Cuenta corriente 15 días", "Contado"), dejá fecha_vencimiento vacía y completá condicion_venta.
6. Si no podés leer un campo, dejalo vacío en vez de inventar.`;

const NEW_CODE = `
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

const apiKey = ${JSON.stringify(OPENAI_API_KEY)};
const SYSTEM_PROMPT = ${JSON.stringify(SYSTEM_PROMPT)};

const resp = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.openai.com/v1/chat/completions',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + apiKey,
  },
  body: {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extraé los datos del comprobante. JSON puro, sin markdown.' },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 1500,
    temperature: 0.1,
  },
  json: true,
});

const content = resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
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

const dt = new Date();
const hoy = String(dt.getDate()).padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0') + '/' + dt.getFullYear();
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

const wfId = "nT0MGKF7URJySwZM";
const wfUrl = `${base}/api/v1/workflows/${wfId}`;
const wf = await api("GET", wfUrl);
const ocr = wf.nodes.find((n) => n.name === "OCR foto");
if (!ocr) throw new Error("No 'OCR foto'.");
ocr.parameters = {
  mode: "runOnceForAllItems",
  language: "javaScript",
  jsCode: NEW_CODE,
};

await api("PUT", wfUrl, {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
});
console.log("✓ SF Factura foto / OCR foto: code reescrito limpio.");
