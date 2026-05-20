/**
 * Hace al SF Libro diario tolerante a typos en cuenta, forma y proveedor.
 *
 * - CUENTA: acepta alias ("vmp", "santander v", "efe") y typos cerca.
 * - FORMA:  acepta abreviaciones ("transf", "trasnf", "cred", "deb").
 * - PROVEEDOR: matching contra catálogo (Levenshtein + contains + sin tildes).
 *
 * Si algo no se puede resolver, tira error con SUGERENCIA útil para que
 * el agente pueda repreguntar al usuario sin reventarse.
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
const SF_ID = "OcPG64aOIccaaEZW";

const PROVEEDORES = [
  "CARNES ANDIAS","PROVEEDOR CERDO","LG OESTE CONGELADOS","BIANCHINELLI","DISTROLAC",
  "MICIELI","COCA COLA","DISTROSOL","MOYA DESCARTABLES","GINO PRIETO MIGA",
  "JOSE MALUF FRANCES","ALFREDO ARABE","PAN HAMBURGUESA","ESPECIAS TILLAR",
  "ROTELLINI ALTO OLEICO","OSCAR DAVID","YAMILA HUEVOS","VERDURAS GENERALES",
];

const PREPARAR_CODE = String.raw`/* ============================================================
 * SF Libro diario · Preparar movimiento
 * Tolera typos en cuenta, forma y proveedor (fuzzy match).
 * ============================================================ */

const FORMAS_INGRESO = {
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

// Alias frecuentes de CUENTAS (todos en mayúsculas, sin tildes).
// La key es lo que escribe el usuario; el value, la cuenta canónica.
const CUENTAS_ALIAS = {
  "EFECTIVO": "EFECTIVO", "EFE": "EFECTIVO", "EFECTIBO": "EFECTIVO", "CAJA": "EFECTIVO", "CASH": "EFECTIVO", "E": "EFECTIVO",

  "VMP": "VALENCHO MERCADO PAGO",
  "MP VALENCHO": "VALENCHO MERCADO PAGO",
  "VALENCHO MP": "VALENCHO MERCADO PAGO",
  "MERCADO PAGO VALENCHO": "VALENCHO MERCADO PAGO",
  "VALENCHO MERCADO PAGO": "VALENCHO MERCADO PAGO",
  "VALENCHO MP 1": "VALENCHO MERCADO PAGO",
  "VALENCHO MP 2": "VALENCHO MERCADO PAGO",

  "FMP": "FRANCISCO MERCADO PAGO",
  "MP FRANCISCO": "FRANCISCO MERCADO PAGO",
  "FRANCISCO MP": "FRANCISCO MERCADO PAGO",
  "MERCADO PAGO FRANCISCO": "FRANCISCO MERCADO PAGO",
  "FRANCISCO MERCADO PAGO": "FRANCISCO MERCADO PAGO",

  "VSAN": "SANTANDER VALENCHO", "SANT V": "SANTANDER VALENCHO", "SANTANDER V": "SANTANDER VALENCHO",
  "VALENCHO SANTANDER": "SANTANDER VALENCHO", "SANTANDER VALENCHO": "SANTANDER VALENCHO",

  "FSAN": "SANTANDER FRANCISCO", "SANT F": "SANTANDER FRANCISCO", "SANTANDER F": "SANTANDER FRANCISCO",
  "FRANCISCO SANTANDER": "SANTANDER FRANCISCO", "SANTANDER FRANCISCO": "SANTANDER FRANCISCO",
};

const FORMAS_ALIAS = {
  "EFECTIVO": "EFECTIVO", "EFE": "EFECTIVO", "EFECTIBO": "EFECTIVO", "CASH": "EFECTIVO",
  "QR": "QR",
  "CREDITO": "CREDITO", "CRED": "CREDITO", "CREDIT": "CREDITO", "CRÉDITO": "CREDITO", "TARJETA CREDITO": "CREDITO", "TARJETA DE CREDITO": "CREDITO",
  "DEBITO": "DEBITO", "DEB": "DEBITO", "DÉBITO": "DEBITO", "TARJETA DEBITO": "DEBITO", "TARJETA DE DEBITO": "DEBITO",
  "ALIAS": "ALIAS",
  "TRANSFERENCIA": "TRANSFERENCIA", "TRANSF": "TRANSFERENCIA", "TRANSFER": "TRANSFERENCIA", "TRANSFERIR": "TRANSFERENCIA", "TRASNF": "TRANSFERENCIA", "TRASFERENCIA": "TRANSFERENCIA",
  "CHEQUE": "CHEQUE", "CHEQ": "CHEQUE", "CHK": "CHEQUE",
};

const PROVEEDORES_CANONICOS = ` + JSON.stringify(PROVEEDORES) + `;

function normaliza(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function levenshtein(a, b) {
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
function fuzzyMatch(input, candidatos, umbral = 0.3) {
  const n = normaliza(input);
  if (!n) return null;
  for (const c of candidatos) if (normaliza(c) === n) return c;
  for (const c of candidatos) {
    const cn = normaliza(c);
    if (cn.includes(n) || n.includes(cn)) return c;
  }
  let best = null, bestD = Infinity;
  for (const c of candidatos) {
    const d = levenshtein(n, normaliza(c));
    const thr = Math.max(2, Math.floor(normaliza(c).length * umbral));
    if (d <= thr && d < bestD) { best = c; bestD = d; }
  }
  return best;
}
function resolverCuenta(raw) {
  const n = normaliza(raw);
  if (CUENTAS_ALIAS[n]) return CUENTAS_ALIAS[n];
  // Heurísticas: si contiene "santander" + "valencho", etc.
  const hasS = /\bSANTANDER\b|\bSANT\b/.test(n);
  const hasV = /\bVALENCHO\b|\bVAL\b/.test(n);
  const hasF = /\bFRANCISCO\b|\bFRAN\b/.test(n);
  const hasMP = /\bMERCADO\s*PAGO\b|\bMP\b/.test(n);
  const hasEf = /\bEFECTIV/.test(n) || /\bCAJA\b/.test(n);
  if (hasEf) return "EFECTIVO";
  if (hasS && hasV) return "SANTANDER VALENCHO";
  if (hasS && hasF) return "SANTANDER FRANCISCO";
  if (hasMP && hasV) return "VALENCHO MERCADO PAGO";
  if (hasMP && hasF) return "FRANCISCO MERCADO PAGO";
  // Fuzzy contra los 5 nombres canónicos
  const canon = Object.values(CUENTAS_ALIAS).filter((v,i,a)=>a.indexOf(v)===i);
  return fuzzyMatch(raw, canon, 0.35);
}
function resolverForma(raw) {
  const n = normaliza(raw);
  if (FORMAS_ALIAS[n]) return FORMAS_ALIAS[n];
  const canon = Object.values(FORMAS_ALIAS).filter((v,i,a)=>a.indexOf(v)===i);
  return fuzzyMatch(raw, canon, 0.4);
}
function resolverProveedor(raw) {
  if (!raw) return '';
  const exact = fuzzyMatch(raw, PROVEEDORES_CANONICOS, 0.3);
  return exact || String(raw).trim();
}

function fechaHoy() {
  const d = new Date();
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
}

const j = $input.first().json;
const tipo = String(j.tipo || '').trim().toLowerCase();
if (tipo !== 'ingreso' && tipo !== 'egreso') {
  throw new Error('tipo inválido (esperado "ingreso" o "egreso"): "' + j.tipo + '". Volvé a preguntar al usuario si es ingreso o egreso.');
}

const cuenta = resolverCuenta(j.cuenta);
if (!cuenta) {
  throw new Error('No reconozco la cuenta "' + (j.cuenta || '') + '". Volvé a preguntar al usuario eligiendo una de: SANTANDER VALENCHO, SANTANDER FRANCISCO, VALENCHO MERCADO PAGO, FRANCISCO MERCADO PAGO, EFECTIVO.');
}

const forma = resolverForma(j.forma);
if (!forma) {
  throw new Error('No reconozco la forma "' + (j.forma || '') + '". Para ' + tipo + ' en ' + cuenta + ' las opciones son: ' + (tipo==='ingreso'?FORMAS_INGRESO[cuenta]:FORMAS_EGRESO[cuenta]).join(', ') + '. Volvé a preguntar al usuario.');
}

const FORMAS = tipo === 'ingreso' ? FORMAS_INGRESO : FORMAS_EGRESO;
if (!FORMAS[cuenta] || !FORMAS[cuenta].includes(forma)) {
  throw new Error('La forma ' + forma + ' no es válida para ' + cuenta + ' en un ' + tipo + '. Opciones válidas: ' + (FORMAS[cuenta]||[]).join(', ') + '. Volvé a preguntar al usuario.');
}

const montoAbs = Math.abs(Number(j.monto));
if (!montoAbs || isNaN(montoAbs)) throw new Error('Monto inválido: "' + j.monto + '". Volvé a preguntar al usuario.');

const proveedor = tipo === 'egreso'
  ? (resolverProveedor(j.proveedor) || 'sin especificar')
  : (String(j.proveedor || '').trim() || 'Venta');

const comentario = String(j.comentario || '').trim();
const categoria = String(j.categoria || '').trim() || (tipo === 'ingreso' ? 'Ingreso' : 'Gasto');
const fecha = String(j.fecha || '').trim() || fechaHoy();
const signed = tipo === 'ingreso' ? montoAbs : -montoAbs;

return [{
  json: {
    tipo, cuenta, forma, fecha,
    monto: signed, monto_abs: montoAbs,
    proveedor, proveedor_original: String(j.proveedor || ''),
    categoria, comentario,
    tipo_comprobante: '', numero_comprobante: '', fecha_vencimiento: '',
    origen: 'n8n',
  }
}];`;

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

async function main() {
  const wf = await api("GET", `/workflows/${SF_ID}`);
  const prep = wf.nodes.find((n) => n.name === "Preparar movimiento");
  if (!prep) throw new Error("Preparar movimiento no encontrado");
  prep.parameters.jsCode = PREPARAR_CODE;
  await api("PUT", `/workflows/${SF_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" }, staticData: wf.staticData ?? null,
  });
  console.log("[OK] SF Libro diario: fuzzy completo de cuenta/forma/proveedor + errores con sugerencia.");
}
main().catch((e) => { console.error(e); process.exit(1); });
