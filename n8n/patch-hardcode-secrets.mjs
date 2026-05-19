/**
 * Workaround: el contenedor n8n en Easypanel no expone env vars al runtime
 * de los Code nodes ($env devuelve {}). Para destrabar, hardcodeamos:
 *   - SUPABASE_URL en el HTTP Request "Descontar saldo cuenta" del SF Gasto.
 *   - OPENAI_API_KEY en el Code "OCR foto" del SF Factura foto.
 *
 * Las claves se leen del .env LOCAL (no se imprimen). Si en algún momento
 * arreglás el bloqueo de env vars en n8n (ver N8N_BLOCK_ENV_ACCESS_IN_NODE),
 * volvé a correr `patch-sf-gasto-fix-rpc.mjs` y `patch-sf-foto-pipeline.mjs`
 * para volver al patrón con $env.
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

const OPENAI_API_KEY = env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY en .env");

let SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
if (!SUPABASE_URL) {
  // Derivar del JWT service role: payload.ref → https://<ref>.supabase.co
  const sr = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sr) throw new Error("Falta SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env (no puedo derivar la URL).");
  try {
    const payload = JSON.parse(Buffer.from(sr.split(".")[1], "base64").toString("utf8"));
    if (!payload.ref) throw new Error("El JWT no contiene 'ref'.");
    SUPABASE_URL = `https://${payload.ref}.supabase.co`;
  } catch (e) {
    throw new Error("No pude derivar SUPABASE_URL del SUPABASE_SERVICE_ROLE_KEY: " + e.message);
  }
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
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

// ── 1) SF Gasto / Descontar saldo cuenta: URL absoluta hardcoded ─────────────
{
  const wfId = "OcPG64aOIccaaEZW";
  const wfUrl = `${base}/api/v1/workflows/${wfId}`;
  const wf = await api("GET", wfUrl);
  const node = wf.nodes.find((n) => n.name === "Descontar saldo cuenta");
  if (!node) throw new Error("No encontré 'Descontar saldo cuenta' en SF Gasto.");

  node.parameters = {
    ...(node.parameters || {}),
    url: `${SUPABASE_URL}/rest/v1/rpc/descontar_saldo`,
  };

  await api("PUT", wfUrl, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("OK SF Gasto: URL Supabase hardcoded.");
}

// ── 2) SF Foto / OCR foto: OpenAI key hardcoded en el Code ───────────────────
{
  const wfId = "nT0MGKF7URJySwZM";
  const wfUrl = `${base}/api/v1/workflows/${wfId}`;
  const wf = await api("GET", wfUrl);
  const node = wf.nodes.find((n) => n.name === "OCR foto");
  if (!node) throw new Error("No encontré 'OCR foto' en SF Foto.");

  const oldCode = String(node.parameters?.jsCode || "");
  // Reemplazamos el bloque que lee $env.OPENAI_API_KEY (con el guard de debug que agregamos antes).
  const PATTERN_DEBUG_GUARD =
    /const apiKey = \$env\.OPENAI_API_KEY;\s*if \(!apiKey\) \{[\s\S]*?\}\s*\}/;
  const PATTERN_PLAIN =
    /const apiKey = \$env\.OPENAI_API_KEY;\s*if \(!apiKey\) throw new Error\([^)]*\);/;

  const HARDCODED = `const apiKey = ${JSON.stringify(OPENAI_API_KEY)};`;

  let newCode;
  if (PATTERN_DEBUG_GUARD.test(oldCode)) {
    newCode = oldCode.replace(PATTERN_DEBUG_GUARD, HARDCODED);
  } else if (PATTERN_PLAIN.test(oldCode)) {
    newCode = oldCode.replace(PATTERN_PLAIN, HARDCODED);
  } else {
    throw new Error("No encontré el bloque de validación de apiKey en 'OCR foto'.");
  }

  node.parameters = { ...(node.parameters || {}), jsCode: newCode };

  await api("PUT", wfUrl, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("OK SF Foto: OpenAI key hardcoded en 'OCR foto'.");
}

console.log("\nListo. Probá: registrar gasto por texto, y mandar una foto al bot.");
