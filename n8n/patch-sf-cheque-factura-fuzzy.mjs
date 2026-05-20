/**
 * Aplica fuzzy match de proveedor a SF Cheque y SF Factura Proveedor.
 * Mismo catálogo y heurística que SF Libro diario.
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
const SF_CHEQUE_ID = "iOAvoQaSdY7OmNHt";
const SF_FACTURA_ID = "CFovQKG2RvJ7OEFB";

const PROVEEDORES = [
  "CARNES ANDIAS","PROVEEDOR CERDO","LG OESTE CONGELADOS","BIANCHINELLI","DISTROLAC",
  "MICIELI","COCA COLA","DISTROSOL","MOYA DESCARTABLES","GINO PRIETO MIGA",
  "JOSE MALUF FRANCES","ALFREDO ARABE","PAN HAMBURGUESA","ESPECIAS TILLAR",
  "ROTELLINI ALTO OLEICO","OSCAR DAVID","YAMILA HUEVOS","VERDURAS GENERALES",
];

const FUZZY_LIB = String.raw`
const PROVEEDORES_CANONICOS = ` + JSON.stringify(PROVEEDORES) + `;
function _norm(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function _leven(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  const dp = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i-1] === b[j-1] ? prev : 1 + Math.min(prev, dp[j], dp[j-1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}
function matchProveedor(input) {
  const n = _norm(input);
  if (!n) return '';
  for (const c of PROVEEDORES_CANONICOS) if (_norm(c) === n) return c;
  for (const c of PROVEEDORES_CANONICOS) { const cn = _norm(c); if (cn.includes(n) || n.includes(cn)) return c; }
  let best = null, bestD = Infinity;
  for (const c of PROVEEDORES_CANONICOS) {
    const d = _leven(n, _norm(c));
    const thr = Math.max(2, Math.floor(_norm(c).length * 0.3));
    if (d <= thr && d < bestD) { best = c; bestD = d; }
  }
  return best || String(input || '').trim();
}
`;

const CHEQUE_PREPARAR = FUZZY_LIB + `
const j = $input.first().json;
function fechaHoy() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
const proveedorRaw = String(j.proveedor || '').trim();
if (!proveedorRaw) throw new Error('Falta proveedor. Volvé a preguntar al usuario a quién va el cheque.');
const proveedor = matchProveedor(proveedorRaw);
const monto = Math.abs(Number(j.monto));
if (!monto || isNaN(monto)) throw new Error('Monto inválido: "' + j.monto + '". Volvé a preguntar.');
const fecha_vencimiento = String(j.fecha_vencimiento || '').trim() || fechaHoy();
const referencia = String(j.referencia || '').trim();
return [{ json: { referencia, proveedor, proveedor_original: proveedorRaw, monto, fecha_vencimiento, foto_url: '' } }];`;

const FACTURA_PREPARAR = FUZZY_LIB + `
const j = $input.first().json;
function fechaHoy() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
const proveedorRaw = String(j.proveedor || '').trim();
if (!proveedorRaw) throw new Error('Falta proveedor. Volvé a preguntar al usuario.');
const proveedor = matchProveedor(proveedorRaw);
const monto = Math.abs(Number(j.monto));
if (!monto || isNaN(monto)) throw new Error('Monto inválido: "' + j.monto + '". Volvé a preguntar.');
const fecha_vencimiento = String(j.fecha_vencimiento || '').trim() || fechaHoy();
const referencia = String(j.referencia || '').trim();
return [{ json: { referencia, proveedor, proveedor_original: proveedorRaw, monto, fecha_vencimiento, foto_url: '' } }];`;

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

async function patchPrepNode(workflowId, preparedCode, label) {
  const wf = await api("GET", `/workflows/${workflowId}`);
  // Buscar el primer nodo Code, que en estos SFs es "Preparar fila" o similar
  const candidates = wf.nodes.filter((n) => n.type === "n8n-nodes-base.code");
  const prep = candidates.find((n) => /preparar|fila|movimiento/i.test(n.name));
  if (!prep) throw new Error(`${label}: no encontré nodo "Preparar ..."`);
  prep.parameters.jsCode = preparedCode;
  await api("PUT", `/workflows/${workflowId}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" }, staticData: wf.staticData ?? null,
  });
  console.log(`[OK] ${label}: fuzzy proveedor aplicado al nodo "${prep.name}".`);
}

await patchPrepNode(SF_CHEQUE_ID,  CHEQUE_PREPARAR,  "SF Cheque");
await patchPrepNode(SF_FACTURA_ID, FACTURA_PREPARAR, "SF Factura proveedor");
