/**
 * Dump JSON completo de un workflow.
 * Uso: node n8n/dump-workflow.mjs <workflowId>
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

const id = process.argv[2];
if (!id) { console.error("Falta workflowId"); process.exit(1); }

const res = await fetch(`${base}/api/v1/workflows/${id}`, { headers: { "X-N8N-API-KEY": key } });
if (!res.ok) { console.error(res.status, await res.text()); process.exit(1); }
const wf = await res.json();
console.log(JSON.stringify(wf, null, 2));
