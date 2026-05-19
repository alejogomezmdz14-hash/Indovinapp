/**
 * Lee los 5 workflows Indovina desde tu n8n real (Easypanel) e imprime un
 * resumen estructurado para diagnosticar el estado.
 * Uso: node n8n/audit-workflows.mjs
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

const env = {
  ...loadEnv(path.join(root, ".env")),
  ...loadEnv(path.join(root, ".env.local")),
};

const base = (env.N8N_API_URL || "").replace(/\/$/, "");
const key = env.N8N_API_KEY;
if (!base || !key) {
  console.error("Faltan N8N_API_URL o N8N_API_KEY en .env");
  process.exit(1);
}

const WORKFLOWS = [
  { id: "rFh6ARtAiROZ4Ors", label: "Padre — Telegram" },
  { id: "OcPG64aOIccaaEZW", label: "SF Gasto" },
  { id: "iOAvoQaSdY7OmNHt", label: "SF Cheque" },
  { id: "CFovQKG2RvJ7OEFB", label: "SF Factura proveedor" },
  { id: "nT0MGKF7URJySwZM", label: "SF Factura foto" },
];

async function getWorkflow(id) {
  const res = await fetch(`${base}/api/v1/workflows/${id}`, {
    headers: { "X-N8N-API-KEY": key },
  });
  if (!res.ok) {
    return { error: `${res.status} ${await res.text().then((t) => t.slice(0, 200))}` };
  }
  return res.json();
}

function summarizeNode(n) {
  const out = {
    id: n.id,
    name: n.name,
    type: n.type,
    typeVersion: n.typeVersion,
  };
  if (n.type === "n8n-nodes-base.httpRequest") {
    out.url = n.parameters?.url;
    out.method = n.parameters?.method;
  }
  if (n.type === "n8n-nodes-base.supabase") {
    out.tableId = n.parameters?.tableId;
    out.operation = n.parameters?.operation;
    out.credName = n.credentials?.supabaseApi?.name;
  }
  if (n.type === "n8n-nodes-base.googleSheets") {
    out.sheetName = n.parameters?.sheetName?.value ?? n.parameters?.sheetName;
    out.range = n.parameters?.range;
    out.operation = n.parameters?.operation;
    out.credName = n.credentials?.googleApi?.name;
  }
  if (n.type === "n8n-nodes-base.telegram") {
    out.operation = n.parameters?.operation;
    out.resource = n.parameters?.resource;
  }
  if (n.type === "n8n-nodes-base.telegramTrigger") {
    out.updates = n.parameters?.updates;
  }
  if (n.type === "n8n-nodes-base.code") {
    const code = n.parameters?.jsCode || "";
    out.codePreview = code.slice(0, 140).replace(/\s+/g, " ") + (code.length > 140 ? "…" : "");
  }
  if (n.type === "@n8n/n8n-nodes-langchain.toolWorkflow") {
    out.targetWorkflowId = n.parameters?.workflowId;
    out.description = (n.parameters?.description || "").slice(0, 80);
  }
  return out;
}

for (const w of WORKFLOWS) {
  console.log("\n" + "═".repeat(72));
  console.log(`▶ ${w.label}  (${w.id})`);
  console.log("═".repeat(72));
  const wf = await getWorkflow(w.id);
  if (wf.error) {
    console.log(`  ✗ Error: ${wf.error}`);
    continue;
  }
  console.log(`  name:    ${wf.name}`);
  console.log(`  active:  ${wf.active}`);
  console.log(`  updated: ${wf.updatedAt}`);
  console.log(`  nodes:   ${wf.nodes.length}`);
  console.log("  ─ nodos:");
  for (const n of wf.nodes) {
    const s = summarizeNode(n);
    console.log("    •", JSON.stringify(s));
  }
  console.log("  ─ conexiones (desde → hacia):");
  for (const [from, conn] of Object.entries(wf.connections || {})) {
    for (const [outType, branches] of Object.entries(conn)) {
      const targets = branches
        .flat()
        .map((c) => `${c.node}[${outType}:${c.index}]`)
        .join(", ");
      console.log(`    ${from} → ${targets}`);
    }
  }
}
console.log("\n" + "═".repeat(72));
console.log("Auditoría completa.");
