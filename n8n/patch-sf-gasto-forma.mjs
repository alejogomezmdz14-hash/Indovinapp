/**
 * Actualiza SF Gasto para que reciba y persista `forma` (QR/CREDITO/DEBITO/ALIAS/EFECTIVO).
 * Valida la combinación cuenta + forma. Inserta en movimientos con la columna forma
 * (migration 009 debe estar aplicada).
 *
 * Uso: node n8n/patch-sf-gasto-forma.mjs
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
const SF_GASTO_ID = "OcPG64aOIccaaEZW";

const NEW_PREPARAR_CODE = `const FORMAS_POR_CUENTA = {
  "SANTANDER VALENCHO":      ["QR", "CREDITO", "DEBITO"],
  "SANTANDER FRANCISCO":     ["QR", "CREDITO", "DEBITO"],
  "VALENCHO MERCADO PAGO":   ["ALIAS"],
  "FRANCISCO MERCADO PAGO":  ["ALIAS"],
  "EFECTIVO":                ["EFECTIVO"],
};
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
  throw new Error('Forma "' + forma + '" no permitida para ' + cuenta + '. Válidas: ' + formasValidas.join(', '));
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
  const wf = await api("GET", `/workflows/${SF_GASTO_ID}`);
  const prep = wf.nodes.find((n) => n.name === "Preparar movimiento");
  if (!prep) throw new Error('Nodo "Preparar movimiento" no encontrado');
  prep.parameters.jsCode = NEW_PREPARAR_CODE;

  const insert = wf.nodes.find((n) => n.name === "Insert movimientos Supabase");
  if (insert) {
    insert.parameters.inputsToIgnore = "cuenta, _monto_positivo";
  }

  await api("PUT", `/workflows/${SF_GASTO_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" },
    staticData: wf.staticData ?? null,
  });
  console.log("[OK] SF Gasto actualizado: ahora valida cuenta+forma y persiste forma.");
}
main().catch((e) => { console.error(e); process.exit(1); });
