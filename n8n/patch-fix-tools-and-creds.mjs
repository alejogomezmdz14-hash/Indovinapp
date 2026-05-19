/**
 * Doble fix crítico:
 *  A) Padre: los 4 toolWorkflow tienen workflowId como string plano.
 *     v2.2 lo requiere como resource locator { __rl: true, value, mode: "id" }.
 *     Por eso fallan al invocar los SFs ("No information about the workflow to execute found").
 *  B) Reasignar la nueva credencial Supabase ltgXKaZvfj3WB1iL en TODOS los nodos
 *     que la usan (la vieja ba4qEQrLnOrIpzDf da "Invalid API key").
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

async function api(method, url, body) {
  const opts = { method, headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

const NEW_SUPABASE_CRED_ID = "ltgXKaZvfj3WB1iL";
const NEW_SUPABASE_CRED_NAME = "Indovina Supabase API (auto)";

const PARENT_ID = "rFh6ARtAiROZ4Ors";
const TARGETS = [
  { id: PARENT_ID, label: "Padre" },
  { id: "OcPG64aOIccaaEZW", label: "SF Gasto" },
  { id: "iOAvoQaSdY7OmNHt", label: "SF Cheque" },
  { id: "CFovQKG2RvJ7OEFB", label: "SF Factura proveedor" },
  { id: "nT0MGKF7URJySwZM", label: "SF Factura foto" },
];

for (const { id, label } of TARGETS) {
  const wfUrl = `${base}/api/v1/workflows/${id}`;
  const wf = await api("GET", wfUrl);
  let dirty = false;

  for (const n of wf.nodes) {
    // Fix A: toolWorkflow / workflowId resource locator.
    if (n.type === "@n8n/n8n-nodes-langchain.toolWorkflow") {
      const cur = n.parameters?.workflowId;
      if (typeof cur === "string") {
        n.parameters.workflowId = { __rl: true, value: cur, mode: "id" };
        console.log(`  • ${label} / ${n.name}: workflowId convertido a resource locator.`);
        dirty = true;
      } else if (cur && typeof cur === "object" && !cur.__rl) {
        n.parameters.workflowId = { __rl: true, value: cur.value || cur, mode: "id" };
        dirty = true;
      }
    }

    // Fix B: reasignar credencial Supabase.
    if (n.type === "n8n-nodes-base.supabase") {
      n.credentials = { supabaseApi: { id: NEW_SUPABASE_CRED_ID, name: NEW_SUPABASE_CRED_NAME } };
      console.log(`  • ${label} / ${n.name}: cred Supabase reasignada (Supabase node).`);
      dirty = true;
    }
    if (n.type === "n8n-nodes-base.httpRequest" && n.parameters?.nodeCredentialType === "supabaseApi") {
      n.credentials = { supabaseApi: { id: NEW_SUPABASE_CRED_ID, name: NEW_SUPABASE_CRED_NAME } };
      console.log(`  • ${label} / ${n.name}: cred Supabase reasignada (HTTP).`);
      dirty = true;
    }
  }

  if (dirty) {
    await api("PUT", wfUrl, {
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings || {},
      staticData: wf.staticData ?? null,
    });
    console.log(`  ✓ ${label} guardado.\n`);
  } else {
    console.log(`  ${label}: nada que cambiar.\n`);
  }
}

console.log("Done.");
