/**
 * Sincroniza el catálogo de proveedores a los 17 oficiales en TODOS los SFs
 * de n8n (Libro diario, Cheque, Factura proveedor). Removido "VERDURAS GENERALES"
 * que estaba demás.
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

const PROVEEDORES_17 = [
  "CARNES ANDIAS","PROVEEDOR CERDO","LG OESTE CONGELADOS","BIANCHINELLI","DISTROLAC",
  "MICIELI","COCA COLA","DISTROSOL","MOYA DESCARTABLES","GINO PRIETO MIGA",
  "JOSE MALUF FRANCES","ALFREDO ARABE","PAN HAMBURGUESA","ESPECIAS TILLAR",
  "ROTELLINI ALTO OLEICO","OSCAR DAVID","YAMILA HUEVOS",
];

const VIEJOS = ["VERDURAS GENERALES"]; // eliminados de la lista

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

function reemplazarArrayEnCodigo(code) {
  // Reemplaza cualquier "const PROVEEDORES_CANONICOS = [...]" por la lista de 17.
  return code.replace(
    /const\s+PROVEEDORES_CANONICOS\s*=\s*\[[^\]]*\];?/m,
    `const PROVEEDORES_CANONICOS = ${JSON.stringify(PROVEEDORES_17)};`,
  );
}

async function patchSF(workflowId, nodeNamePatterns, label) {
  const wf = await api("GET", `/workflows/${workflowId}`);
  let touched = 0;
  for (const node of wf.nodes) {
    if (node.type !== "n8n-nodes-base.code") continue;
    if (!nodeNamePatterns.some((p) => p.test(node.name))) continue;
    const before = node.parameters?.jsCode ?? "";
    const after = reemplazarArrayEnCodigo(before);
    if (after !== before) {
      node.parameters.jsCode = after;
      touched++;
      console.log(`  [${label}] Actualizado nodo: ${node.name}`);
    }
  }
  if (touched === 0) {
    console.log(`  [${label}] No se encontró código con PROVEEDORES_CANONICOS.`);
    return;
  }
  await api("PUT", `/workflows/${workflowId}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings ?? { executionOrder: "v1" }, staticData: wf.staticData ?? null,
  });
  console.log(`[OK] ${label}: ${touched} nodo(s) actualizado(s).`);
}

await patchSF("OcPG64aOIccaaEZW", [/preparar movimiento/i],             "SF Libro diario");
await patchSF("iOAvoQaSdY7OmNHt", [/preparar fila/i, /preparar/i],       "SF Cheque");
await patchSF("CFovQKG2RvJ7OEFB", [/preparar fila/i, /preparar/i],       "SF Factura proveedor");

// Actualizar también el system prompt del padre para que mencione los 17.
const PADRE_ID = "rFh6ARtAiROZ4Ors";
const padre = await api("GET", `/workflows/${PADRE_ID}`);
const agent = padre.nodes.find((n) => n.name === "AI Agent");
if (agent?.parameters?.options?.systemMessage) {
  let sp = agent.parameters.options.systemMessage;
  // Reemplazar la línea con la lista de proveedores
  const listaTexto = PROVEEDORES_17.join(", ") + ".";
  sp = sp.replace(/CARNES ANDIAS,[\s\S]*?VERDURAS GENERALES\./g, listaTexto);
  sp = sp.replace(/CARNES ANDIAS,[\s\S]*?YAMILA HUEVOS\./g, listaTexto);
  for (const v of VIEJOS) sp = sp.replaceAll(v, "");
  agent.parameters.options.systemMessage = sp;
  await api("PUT", `/workflows/${PADRE_ID}`, {
    name: padre.name, nodes: padre.nodes, connections: padre.connections,
    settings: padre.settings ?? { executionOrder: "v1" }, staticData: padre.staticData ?? null,
  });
  console.log("[OK] Padre: system prompt sincronizado a 17 proveedores.");
}
