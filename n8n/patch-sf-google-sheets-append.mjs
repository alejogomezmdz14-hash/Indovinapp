/**
 * Añade nodo Google Sheets (append) después del POST Supabase en cada SF Indovina.
 * Requiere en n8n: variable GOOGLE_SHEET_ID + credencial Google Sheets (OAuth o Service Account con acceso a la planilla).
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

const docRl = { __rl: true, mode: "id", value: "={{ $env.GOOGLE_SHEET_ID }}" };

const configs = [
  {
    id: "OcPG64aOIccaaEZW",
    httpName: "Insert movimientos Supabase",
    prepararName: "Preparar movimiento",
    sheetName: "Libro diario",
    range: "A:H",
    sheetNodeName: "Mirror Sheets libro diario",
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
  },
  {
    id: "iOAvoQaSdY7OmNHt",
    httpName: "Insert cheques Supabase",
    prepararName: "Preparar fila",
    sheetName: "cheques",
    range: "A:D",
    sheetNodeName: "Mirror Sheets cheques",
    columns: {
      mappingMode: "defineBelow",
      value: {
        Referencia: "={{ $('Preparar fila').item.json.referencia }}",
        Proveedor: "={{ $('Preparar fila').item.json.proveedor }}",
        Monto: "={{ $('Preparar fila').item.json.monto }}",
        "Fecha vencimiento": "={{ $('Preparar fila').item.json.fecha_vencimiento }}",
      },
    },
  },
  {
    id: "CFovQKG2RvJ7OEFB",
    httpName: "Insert facturas_proveedor Supabase",
    prepararName: "Preparar fila",
    sheetName: "proveedores",
    range: "A:D",
    sheetNodeName: "Mirror Sheets proveedores",
    columns: {
      mappingMode: "defineBelow",
      value: {
        Referencia: "={{ $('Preparar fila').item.json.referencia }}",
        Proveedor: "={{ $('Preparar fila').item.json.proveedor }}",
        Monto: "={{ $('Preparar fila').item.json.monto }}",
        "Fecha vencimiento": "={{ $('Preparar fila').item.json.fecha_vencimiento }}",
      },
    },
  },
  {
    id: "nT0MGKF7URJySwZM",
    httpName: "Insert facturas_foto Supabase",
    prepararName: "Preparar fila",
    sheetName: "proveedores",
    range: "A:D",
    sheetNodeName: "Mirror Sheets proveedores (foto)",
    columns: {
      mappingMode: "defineBelow",
      value: {
        Referencia: "={{ $('Preparar fila').item.json.referencia }}",
        Proveedor: "={{ $('Preparar fila').item.json.proveedor }}",
        Monto: "={{ $('Preparar fila').item.json.monto }}",
        "Fecha vencimiento": "={{ $('Preparar fila').item.json.fecha_vencimiento }}",
      },
    },
  },
];

function sheetNode(cfg, sheetId, y) {
  return {
    id: sheetId,
    name: cfg.sheetNodeName,
    type: "n8n-nodes-base.googleSheets",
    typeVersion: 4.7,
    position: [920, y],
    parameters: {
      resource: "sheet",
      operation: "append",
      documentId: docRl,
      sheetName: { __rl: true, mode: "name", value: cfg.sheetName },
      range: cfg.range,
      columns: cfg.columns,
      options: {},
    },
    continueOnFail: true,
  };
}

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

for (let i = 0; i < configs.length; i++) {
  const cfg = configs[i];
  const url = `${base}/api/v1/workflows/${cfg.id}`;
  const wf = await api("GET", url);
  const http = wf.nodes.find((n) => n.name === cfg.httpName);
  const responder = wf.nodes.find((n) => n.name === "Responder");
  if (!http || !responder) throw new Error(`${cfg.id}: missing HTTP or Responder`);

  const sheetId = `d2000001-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
  const y = http.position[1];

  const otherNodes = wf.nodes.filter((n) => n.name !== cfg.sheetNodeName);
  const nodes = [...otherNodes, sheetNode(cfg, sheetId, y)];

  const connections = { ...wf.connections };
  delete connections[cfg.sheetNodeName];

  connections[cfg.httpName] = {
    main: [[{ node: cfg.sheetNodeName, type: "main", index: 0 }]],
  };
  connections[cfg.sheetNodeName] = {
    main: [[{ node: "Responder", type: "main", index: 0 }]],
  };

  await api("PUT", url, {
    name: wf.name,
    nodes,
    connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("OK sheets bridge:", cfg.id, cfg.sheetNodeName);
}
