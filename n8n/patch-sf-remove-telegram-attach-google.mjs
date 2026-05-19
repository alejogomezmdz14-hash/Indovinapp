/**
 * 1. Remove nodo Telegram "Responder" from each SF
 * 2. Connect último nodo (Mirror Sheets) -> Code "Salida subflujo" (solo JSON para el tool)
 * 3. Asignar credencial Google API a todos los nodos googleSheets
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

function loadEnv(file) {
  const out = {};
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

const env = loadEnv(envPath);
const base = (env.N8N_API_URL || "").replace(/\/$/, "");
const key = env.N8N_API_KEY;
if (!base || !key) throw new Error("N8N_API_URL and N8N_API_KEY required");

const credIdPath = path.join(__dirname, "._google_cred_id.txt");
let GOOGLE_CRED_ID = fs.readFileSync(credIdPath, "utf8").trim();
if (!GOOGLE_CRED_ID) GOOGLE_CRED_ID = "sRJO10BQ7SeExffT";

const GOOGLE_CRED_NAME = "Indovina Google Service Account";

const workflows = [
  { id: "OcPG64aOIccaaEZW", preparar: "Preparar movimiento", kind: "gasto", mirror: "Mirror Sheets libro diario" },
  { id: "iOAvoQaSdY7OmNHt", preparar: "Preparar fila", kind: "cheque", mirror: "Mirror Sheets cheques" },
  { id: "CFovQKG2RvJ7OEFB", preparar: "Preparar fila", kind: "factura_proveedor", mirror: "Mirror Sheets proveedores" },
  { id: "nT0MGKF7URJySwZM", preparar: "Preparar fila", kind: "factura_foto", mirror: "Mirror Sheets proveedores (foto)" },
];

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

for (let i = 0; i < workflows.length; i++) {
  const cfg = workflows[i];
  const url = `${base}/api/v1/workflows/${cfg.id}`;
  const wf = await api("GET", url);

  const salidaId = `f3aaaaaa-0000-4000-8000-00000000000${i + 1}`;
  const jsCode = `const datos = $('${cfg.preparar}').item.json;\nreturn [{ json: { ok: true, tipo: '${cfg.kind}', datos } }];`;

  const nodes = wf.nodes
    .filter((n) => n.name !== "Responder")
    .map((n) => {
      if (n.type === "n8n-nodes-base.googleSheets") {
        return {
          ...n,
          credentials: {
            googleApi: { id: GOOGLE_CRED_ID, name: GOOGLE_CRED_NAME },
          },
        };
      }
      return n;
    });

  const hasSalida = nodes.some((n) => n.name === "Salida subflujo");
  if (!hasSalida) {
    const mirrorNode = nodes.find((n) => n.name === cfg.mirror);
    const y = mirrorNode ? mirrorNode.position[1] : 0;
    nodes.push({
      id: salidaId,
      name: "Salida subflujo",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1120, y],
      parameters: { jsCode, mode: "runOnceForAllItems" },
    });
  }

  const connections = { ...wf.connections };
  delete connections.Responder;
  connections[cfg.mirror] = {
    main: [[{ node: "Salida subflujo", type: "main", index: 0 }]],
  };
  connections["Salida subflujo"] = { main: [[]] };

  await api("PUT", url, {
    name: wf.name,
    nodes,
    connections,
    settings: wf.settings || {},
    staticData: wf.staticData ?? null,
  });
  console.log("OK SF patched:", cfg.id);
}

console.log("Done. Google credential:", GOOGLE_CRED_ID);
