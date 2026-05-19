/**
 * Diagnóstico: actualiza el nodo "OCR foto" del SF nT0MGKF7URJySwZM
 * para que, si falta OPENAI_API_KEY, el error liste qué env vars
 * relevantes SÍ está viendo n8n (sin imprimir valores).
 *
 * Sin cambios funcionales: solo mejora el mensaje de error inicial.
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
if (!base || !key) throw new Error("Faltan N8N_API_URL y N8N_API_KEY en .env");

const SF_FOTO_ID = "nT0MGKF7URJySwZM";
const NAME_OCR = "OCR foto";

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

const wfUrl = `${base}/api/v1/workflows/${SF_FOTO_ID}`;
const wf = await api("GET", wfUrl);

const ocr = wf.nodes.find((n) => n.name === NAME_OCR);
if (!ocr) throw new Error(`No encontré el nodo "${NAME_OCR}" en el SF.`);

const oldCode = String(ocr.parameters?.jsCode || "");

const NEW_GUARD = `const apiKey = $env.OPENAI_API_KEY;
if (!apiKey) {
  let visibles = [];
  try {
    visibles = Object.keys($env || {})
      .filter(function (k) { return /OPENAI|TELEGRAM|SUPABASE|GOOGLE|N8N|WEBHOOK|DRIVE/i.test(k); })
      .sort();
  } catch (e) {}
  throw new Error(
    'Falta OPENAI_API_KEY en el contenedor n8n. Env vars relevantes que SÍ ve: ' +
    (visibles.length ? visibles.join(', ') : '(ninguna)')
  );
}`;

// Reemplazar SOLO el bloque "const apiKey = $env.OPENAI_API_KEY; ... throw ..."
// (3 líneas en el código original).
const PATTERN =
  /const apiKey = \$env\.OPENAI_API_KEY;\s*if \(!apiKey\) throw new Error\('Falta OPENAI_API_KEY[^']*'\);/;

if (!PATTERN.test(oldCode)) {
  throw new Error(
    "No encontré el bloque original de validación de OPENAI_API_KEY en el Code node. ¿Ya fue parcheado antes?",
  );
}

ocr.parameters = { ...(ocr.parameters || {}), jsCode: oldCode.replace(PATTERN, NEW_GUARD) };

const putBody = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
};

const updated = await api("PUT", wfUrl, putBody);
console.log("OK SF foto (debug env):", updated.id);
