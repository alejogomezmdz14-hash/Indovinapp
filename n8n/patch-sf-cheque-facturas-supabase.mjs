/**
 * SF Cheque / Factura proveedor / Factura foto -> Supabase REST + Telegram.
 * Variables n8n: SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

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

const env = loadEnv(envPath);
const base = (env.N8N_API_URL || "").replace(/\/$/, "");
const key = env.N8N_API_KEY;
if (!base || !key) throw new Error("N8N_API_URL and N8N_API_KEY required in .env");

const SUPABASE_BASE = "https://dtbmzlncbtxcxdujkrko.supabase.co/rest/v1";
const TG_CRED = { id: "vIYEwFVlRVRV1GSK", name: "Telegram account" };

const codeCheque = `const j = $input.first().json;
const msg = j.message ?? j;
const text = (msg.text ?? j.text ?? j['=text'] ?? '').toString().trim();
const parts = text.split(/\\s+/).filter(Boolean);
let monto = 0, proveedor = '', fecha_vencimiento = '', referencia = '';
if (parts.length >= 2) { const n = Number(parts[1].replace(',', '.')); if (!Number.isNaN(n)) monto = n; }
if (parts.length >= 3) proveedor = parts.slice(2, -1).join(' ') || parts[2] || '';
if (parts.length >= 1) fecha_vencimiento = parts[parts.length - 1] || '';
if (!/\\d/.test(fecha_vencimiento)) { fecha_vencimiento = ''; proveedor = parts.slice(2).join(' ') || 'sin especificar'; }
if (!fecha_vencimiento) fecha_vencimiento = '-';
if (!proveedor) proveedor = 'sin especificar';
return [{ json: { referencia, proveedor, monto, fecha_vencimiento } }];`;

const codeFactura = `const j = $input.first().json;
const msg = j.message ?? j;
const text = (msg.text ?? j.text ?? j['=text'] ?? '').toString().trim();
const parts = text.split(/\\s+/).filter(Boolean);
let monto = 0, proveedor = '', fecha_vencimiento = '', referencia = '';
if (parts.length >= 2) { const n = Number(parts[1].replace(',', '.')); if (!Number.isNaN(n)) monto = n; }
if (parts.length >= 3) proveedor = parts.slice(2, -1).join(' ') || parts[2] || '';
if (parts.length >= 1) fecha_vencimiento = parts[parts.length - 1] || '';
if (!/\\d/.test(fecha_vencimiento)) { fecha_vencimiento = ''; proveedor = parts.slice(2).join(' ') || 'sin especificar'; }
if (!fecha_vencimiento) fecha_vencimiento = '-';
if (!proveedor) proveedor = 'sin especificar';
return [{ json: { referencia, proveedor, monto, fecha_vencimiento } }];`;

const codeFoto = `const j = $input.first().json;
const msg = j.message ?? j;
const text = (msg.text ?? j.text ?? j['=text'] ?? '').toString().trim();
return [{ json: { referencia: 'telegram', proveedor: 'pendiente-foto-OCR', monto: 0, fecha_vencimiento: '-' } }];`;

function buildNodes(kind, code, restPath, replyLabel) {
  const startId = "c1000001-0000-4000-8000-000000000001";
  const codeId = "c1000001-0000-4000-8000-000000000003";
  const httpId = "c1000001-0000-4000-8000-000000000004";
  const tgId = "c1000001-0000-4000-8000-000000000002";
  const y = kind === "cheque" ? 0 : kind === "prov" ? 120 : 240;
  return [
    {
      id: startId,
      name: "Start",
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, y],
      parameters: { inputSource: "passthrough" },
    },
    {
      id: codeId,
      name: "Preparar fila",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, y],
      parameters: { jsCode: code, mode: "runOnceForAllItems" },
    },
    {
      id: httpId,
      name: "Post Supabase",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.4,
      position: [460, y],
      parameters: {
        method: "POST",
        url: `${SUPABASE_BASE}/${restPath}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "apikey", value: "={{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
            { name: "Authorization", value: "={{ 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }}" },
            { name: "Content-Type", value: "application/json" },
            { name: "Prefer", value: "return=minimal" },
          ],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json) }}",
        options: {},
      },
    },
    {
      id: tgId,
      name: "Responder",
      type: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [700, y],
      parameters: {
        resource: "message",
        operation: "sendMessage",
        chatId: "={{ $('Start').item.json.message.chat.id }}",
        text: `={{ '${replyLabel} guardado. Monto: ' + $('Preparar fila').item.json.monto + ' | ' + $('Preparar fila').item.json.proveedor }}`,
        additionalFields: { appendAttribution: false },
      },
      credentials: { telegramApi: TG_CRED },
    },
  ];
}

function buildConnections() {
  return {
    Start: { main: [[{ node: "Preparar fila", type: "main", index: 0 }]] },
    "Preparar fila": { main: [[{ node: "Post Supabase", type: "main", index: 0 }]] },
    "Post Supabase": { main: [[{ node: "Responder", type: "main", index: 0 }]] },
  };
}

const configs = [
  {
    id: "iOAvoQaSdY7OmNHt",
    kind: "cheque",
    code: codeCheque,
    restPath: "cheques",
    reply: "Cheque",
  },
  {
    id: "CFovQKG2RvJ7OEFB",
    kind: "prov",
    code: codeFactura,
    restPath: "facturas_proveedor",
    reply: "Factura proveedor",
  },
  {
    id: "nT0MGKF7URJySwZM",
    kind: "foto",
    code: codeFoto,
    restPath: "facturas_proveedor",
    reply: "Factura (texto/foto pendiente)",
  },
];

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

for (const c of configs) {
  const url = `${base}/api/v1/workflows/${c.id}`;
  const wf = await api("GET", url);
  const nodes = buildNodes(c.kind, c.code, c.restPath, c.reply);
  const putBody = {
    name: wf.name,
    nodes,
    connections: buildConnections(),
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  };
  await api("PUT", url, putBody);
  console.log("OK", c.id, wf.name);
}
