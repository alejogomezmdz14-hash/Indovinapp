/**
 * Reemplaza el Mirror Sheets para usar autoMapInputData en lugar de defineBelow.
 * Las keys del JSON que devuelve "Preparar fila sheet" ahora coinciden EXACTAMENTE
 * con los headers del sheet (con sus espacios y todo), incluido el header roto
 * "Detalle de los movimiento s".
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

// JSON con keys = headers exactos del sheet. El nodo Google Sheets en
// autoMapInputData busca columnas con esos nombres y las llena.
const PREPARAR_SHEET_CODE = `const p = $('Preparar movimiento').item.json;
const esIngreso = p.tipo === 'ingreso';
const detalle = p.comentario ? p.proveedor + ' - ' + p.comentario : p.proveedor;
const fila = {};
fila['Fecha ']                     = p.fecha;
fila['categoria']                  = p.categoria;
fila['Detalle de los movimiento s'] = detalle;
fila['ingresos']                   = esIngreso ? p.monto_abs : '';
fila['egresos']                    = esIngreso ? '' : p.monto_abs;
fila['medio de ingreso']           = esIngreso ? p.forma : '';
fila['medio de egreso ']           = esIngreso ? '' : p.forma;
return [{ json: fila }];`;

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

  // 1) Actualizar "Preparar fila sheet" para devolver keys = headers
  const prep = wf.nodes.find((n) => n.name === "Preparar fila sheet");
  if (!prep) throw new Error("Preparar fila sheet no encontrado");
  prep.parameters.jsCode = PREPARAR_SHEET_CODE;

  // 2) Reescribir Mirror Sheets a autoMapInputData
  const m = wf.nodes.find((n) => n.name === "Mirror Sheets Libro diario");
  if (!m) throw new Error("Mirror Sheets no encontrado");
  m.parameters = {
    resource: "sheet",
    operation: "append",
    documentId: { __rl: true, mode: "id", value: SHEET_ID },
    sheetName:  { __rl: true, mode: "name", value: "Libro diario" },
    columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [] },
    options: {},
    authentication: "serviceAccount",
  };
  m.credentials = { googleApi: { id: GOOGLE_CRED_ID, name: "Indovina Google Service Account" } };
  m.continueOnFail = true;

  await api("PUT", `/workflows/${SF_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" }, staticData: wf.staticData ?? null,
  });
  console.log("[OK] Mirror Sheets: ahora con autoMapInputData (keys = headers exactos).");
}
main().catch((e) => { console.error(e); process.exit(1); });
