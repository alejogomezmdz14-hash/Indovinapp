/**
 * Fix dobles para el SF Libro diario:
 *  1) "Preparar movimiento" — agrega fuzzy match de proveedor contra una lista canónica.
 *  2) Reemplaza nodo "Mirror Sheets Libro diario" por:
 *       Preparar fila sheet (Code)   ← pre-calcula las 9 columnas sin ternarios
 *       Mirror Sheets Libro diario   ← usa los campos pre-calculados
 *     (el error anterior "Could not get parameter" venía de los ternarios `{{ ... ? ... }}`)
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
const SHEET_ID = env.GOOGLE_SHEET_ID;
const SF_ID = "OcPG64aOIccaaEZW";
const GOOGLE_CRED_ID = "IR5D8tfAlpwgHXkz";

const PROVEEDORES = [
  "CARNES ANDIAS","PROVEEDOR CERDO","LG OESTE CONGELADOS","BIANCHINELLI","DISTROLAC",
  "MICIELI","COCA COLA","DISTROSOL","MOYA DESCARTABLES","GINO PRIETO MIGA",
  "JOSE MALUF FRANCES","ALFREDO ARABE","PAN HAMBURGUESA","ESPECIAS TILLAR",
  "ROTELLINI ALTO OLEICO","OSCAR DAVID","YAMILA HUEVOS","VERDURAS GENERALES",
];

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

// Catálogo de proveedores conocidos para fuzzy matching de typos.
const PROVEEDORES_CANONICOS = ${JSON.stringify(PROVEEDORES)};

function normaliza(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '') // quita tildes
    .replace(/\\s+/g, ' ')
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
      dp[j] = a[i-1] === b[j-1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j-1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}
function matchProveedor(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const norm = normaliza(raw);
  // Exact match (normalized)
  for (const c of PROVEEDORES_CANONICOS) {
    if (normaliza(c) === norm) return c;
  }
  // Contains match (cualquier palabra del input está en canónico, o viceversa)
  for (const c of PROVEEDORES_CANONICOS) {
    const cn = normaliza(c);
    if (cn.includes(norm) || norm.includes(cn)) return c;
  }
  // Fuzzy: Levenshtein <= 30% del largo del canónico
  let best = null, bestDist = Infinity;
  for (const c of PROVEEDORES_CANONICOS) {
    const d = levenshtein(norm, normaliza(c));
    const thr = Math.max(2, Math.floor(normaliza(c).length * 0.3));
    if (d <= thr && d < bestDist) { best = c; bestDist = d; }
  }
  return best || raw; // si no matchea, devuelve el original
}

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

const proveedorRaw = String(j.proveedor || '').trim();
// Para EGRESO, intentamos normalizar contra catálogo de proveedores.
// Para INGRESO, mantenemos texto libre (cliente / descripción de venta).
const proveedor = tipo === 'egreso'
  ? (matchProveedor(proveedorRaw) || proveedorRaw || 'sin especificar')
  : (proveedorRaw || 'Venta');

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
    proveedor_original: proveedorRaw,
    categoria,
    comentario,
    tipo_comprobante: '',
    numero_comprobante: '',
    fecha_vencimiento: '',
    origen: 'n8n',
  }
}];`;

const PREPARAR_SHEET_CODE = `// Pre-calcula los 7 valores que van al Sheet sin usar ternarios en expresiones n8n.
const p = $('Preparar movimiento').item.json;
const esIngreso = p.tipo === 'ingreso';
const detalle = p.comentario ? p.proveedor + ' - ' + p.comentario : p.proveedor;
return [{
  json: {
    sheet_fecha: p.fecha,
    sheet_categoria: p.categoria,
    sheet_detalle: detalle,
    sheet_ingresos:  esIngreso ? p.monto_abs : '',
    sheet_egresos:   esIngreso ? '' : p.monto_abs,
    sheet_medio_in:  esIngreso ? p.forma : '',
    sheet_medio_eg:  esIngreso ? '' : p.forma,
  }
}];`;

async function api(method, p, body) {
  const r = await fetch(`${URL}/api/v1${p}`, {
    method,
    headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${t.slice(0, 600)}`);
  return t ? JSON.parse(t) : null;
}

async function main() {
  const wf = await api("GET", `/workflows/${SF_ID}`);

  // 1) Update "Preparar movimiento"
  const prep = wf.nodes.find((n) => n.name === "Preparar movimiento");
  if (!prep) throw new Error("Preparar movimiento no encontrado");
  prep.parameters.jsCode = PREPARAR_CODE;

  // 2) Crear nodo "Preparar fila sheet" (entre Actualizar saldo y Mirror Sheets)
  const prepSheet = {
    id: "lb000001-0000-4000-8000-00000000000a",
    name: "Preparar fila sheet",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1180, 200],
    parameters: { jsCode: PREPARAR_SHEET_CODE, mode: "runOnceForAllItems" },
  };

  // 3) Reescribir Mirror Sheets: ahora referencia campos pre-calculados (sin ternarios)
  const mirror = wf.nodes.find((n) => n.name === "Mirror Sheets Libro diario");
  if (!mirror) throw new Error("Mirror Sheets Libro diario no encontrado");
  mirror.position = [1420, 200];
  mirror.parameters.columns = {
    mappingMode: "defineBelow",
    value: {
      "Fecha ":                      "={{ $json.sheet_fecha }}",
      "categoria":                   "={{ $json.sheet_categoria }}",
      "Detalle de los movimiento s": "={{ $json.sheet_detalle }}",
      "ingresos":                    "={{ $json.sheet_ingresos }}",
      "egresos":                     "={{ $json.sheet_egresos }}",
      "medio de ingreso":            "={{ $json.sheet_medio_in }}",
      "medio de egreso ":            "={{ $json.sheet_medio_eg }}",
    },
  };

  // Insertar nodo "Preparar fila sheet" en la lista
  if (!wf.nodes.find((n) => n.name === "Preparar fila sheet")) {
    wf.nodes.push(prepSheet);
  }

  // 4) Rearmar conexiones: ... Actualizar saldo -> Preparar fila sheet -> Mirror Sheets -> Salida
  const salida = wf.nodes.find((n) => n.name === "Salida subflujo");
  salida.position = [1660, 0];
  wf.connections["Actualizar saldo cuenta"] = { main: [[{ node: "Preparar fila sheet", type: "main", index: 0 }]] };
  wf.connections["Preparar fila sheet"]     = { main: [[{ node: "Mirror Sheets Libro diario", type: "main", index: 0 }]] };
  wf.connections["Mirror Sheets Libro diario"] = { main: [[{ node: "Salida subflujo", type: "main", index: 0 }]] };

  await api("PUT", `/workflows/${SF_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" }, staticData: wf.staticData ?? null,
  });
  console.log("[OK] SF Libro diario: fuzzy proveedor + Mirror Sheets sin ternarios.");
}
main().catch((e) => { console.error(e); process.exit(1); });
