/**
 * Hardcodea el GOOGLE_SHEET_ID en TODOS los nodos Mirror Sheets de los SFs.
 * El contenedor n8n no expone $env a las expresiones, por lo que `={{ $env.GOOGLE_SHEET_ID }}`
 * resuelve a "undefined" y los nodos Sheets fallan en silencio.
 *
 * Lee GOOGLE_SHEET_ID del .env local y lo embebe directo como literal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
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
const env = { ...loadEnv(path.join(root, ".env")), ...loadEnv(path.join(root, ".env.local")) };
const base = (env.N8N_API_URL || "").replace(/\/$/, "");
const key = env.N8N_API_KEY;
const SHEET_ID = env.GOOGLE_SHEET_ID;
if (!base || !key) throw new Error("Faltan N8N_API_URL y N8N_API_KEY en .env");
if (!SHEET_ID) throw new Error("Falta GOOGLE_SHEET_ID en .env");

async function api(method, url, body) {
  const opts = {
    method,
    headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

const TARGETS = [
  { id: "OcPG64aOIccaaEZW", label: "SF Gasto" },
  { id: "iOAvoQaSdY7OmNHt", label: "SF Cheque" },
  { id: "CFovQKG2RvJ7OEFB", label: "SF Factura proveedor" },
  { id: "nT0MGKF7URJySwZM", label: "SF Factura foto" },
];

let fixedTotal = 0;
for (const { id, label } of TARGETS) {
  const wfUrl = `${base}/api/v1/workflows/${id}`;
  const wf = await api("GET", wfUrl);
  let fixed = 0;
  for (const n of wf.nodes) {
    if (n.type !== "n8n-nodes-base.googleSheets") continue;
    const docVal = n.parameters?.documentId?.value;
    const wasBroken =
      typeof docVal === "string" &&
      (docVal.includes("$env.GOOGLE_SHEET_ID") || docVal.includes("undefined"));
    n.parameters = {
      ...(n.parameters || {}),
      documentId: { __rl: true, mode: "id", value: SHEET_ID },
    };
    if (wasBroken) fixed++;
    console.log(`  • ${label} / ${n.name}: documentId hardcodeado${wasBroken ? " (estaba ROTO)" : ""}.`);
  }
  if (fixed > 0) {
    await api("PUT", wfUrl, {
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings || {},
      staticData: wf.staticData ?? null,
    });
    fixedTotal += fixed;
    console.log(`  ✓ ${label} guardado (${fixed} nodos arreglados).\n`);
  } else {
    // Igual hacemos PUT por si la mejora de seguridad lo require, pero solo si hay nodos sheets.
    const hasSheets = wf.nodes.some((n) => n.type === "n8n-nodes-base.googleSheets");
    if (hasSheets) {
      await api("PUT", wfUrl, {
        name: wf.name,
        nodes: wf.nodes,
        connections: wf.connections,
        settings: wf.settings || {},
        staticData: wf.staticData ?? null,
      });
      console.log(`  ✓ ${label} guardado (re-aplicado por consistencia).\n`);
    }
  }
}

console.log(`\nTotal nodos Sheets arreglados: ${fixedTotal}`);
console.log(`SHEET_ID embebido: ${SHEET_ID}`);
