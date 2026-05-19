/**
 * SF Gasto: Start -> Code (preparar fila) -> HTTP POST Supabase -> Telegram.
 * Requiere en n8n (Settings -> Variables): SUPABASE_SERVICE_ROLE_KEY
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

const WF_ID = "OcPG64aOIccaaEZW";
const SUPABASE_REST = "https://dtbmzlncbtxcxdujkrko.supabase.co/rest/v1/movimientos";

const jsCode = `const j = $input.first().json;
const msg = j.message ?? j;
const text = (msg.text ?? j.text ?? j['=text'] ?? '').toString().trim();
const parts = text.split(/\\s+/).filter(Boolean);
let monto = 0;
let proveedor = '';
if (parts.length >= 2) {
  const n = Number(parts[1].replace(',', '.'));
  if (!Number.isNaN(n)) monto = n;
}
if (parts.length >= 3) proveedor = parts.slice(2).join(' ');
const hoy = new Date();
const fecha = String(hoy.getDate()).padStart(2, '0') + '/' + String(hoy.getMonth() + 1).padStart(2, '0') + '/' + hoy.getFullYear();
return [{
  json: {
    fecha,
    monto,
    proveedor: proveedor || 'sin especificar',
    categoria: 'Gasto',
    comentario: text || '(vacío)',
    tipo_comprobante: '',
    numero_comprobante: '',
    fecha_vencimiento: '',
    origen: 'n8n'
  }
}];`;

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
    parameters: { jsCode, mode: "runOnceForAllItems" },
  },
  {
    id: "b1000001-0000-4000-8000-000000000004",
    name: "Post movimiento Supabase",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.4,
    position: [460, 0],
    parameters: {
      method: "POST",
      url: SUPABASE_REST,
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
    id: "b1000001-0000-4000-8000-000000000002",
    name: "Responder",
    type: "n8n-nodes-base.telegram",
    typeVersion: 1.2,
    position: [700, 0],
    parameters: {
      resource: "message",
      operation: "sendMessage",
      chatId: "={{ $('Start').item.json.message.chat.id }}",
      text: "={{ 'Gasto guardado en Supabase. Monto: ' + $('Preparar movimiento').item.json.monto + ' | ' + $('Preparar movimiento').item.json.proveedor }}",
      additionalFields: { appendAttribution: false },
    },
    credentials: {
      telegramApi: { id: "vIYEwFVlRVRV1GSK", name: "Telegram account" },
    },
  },
];

const connections = {
  Start: {
    main: [[{ node: "Preparar movimiento", type: "main", index: 0 }]],
  },
  "Preparar movimiento": {
    main: [[{ node: "Post movimiento Supabase", type: "main", index: 0 }]],
  },
  "Post movimiento Supabase": {
    main: [[{ node: "Responder", type: "main", index: 0 }]],
  },
};

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

const url = `${base}/api/v1/workflows/${WF_ID}`;
const wf = await api("GET", url);
const putBody = {
  name: wf.name,
  nodes,
  connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
};
const updated = await api("PUT", url, putBody);
console.log("OK SF Gasto:", updated.id, "nodes:", updated.nodes?.length);
