/**
 * One-off: wire parent workflow rFh6ARtAiROZ4Ors (Router + Execute Sub-workflow).
 * Reads N8N_API_URL and N8N_API_KEY from repo .env — does not print secrets.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
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
if (!base || !key) throw new Error("N8N_API_URL and N8N_API_KEY required in .env");

const WORKFLOW_ID = "rFh6ARtAiROZ4Ors";

const ROUTER_ID = "a1111111-1111-4111-8111-111111111101";
const EXEC_IDS = {
  gasto: "a1111111-1111-4111-8111-111111111102",
  cheque: "a1111111-1111-4111-8111-111111111103",
  proveedor: "a1111111-1111-4111-8111-111111111104",
  foto: "a1111111-1111-4111-8111-111111111105",
};

const SUB_IDS = {
  gasto: "OcPG64aOIccaaEZW",
  cheque: "iOAvoQaSdY7OmNHt",
  proveedor: "CFovQKG2RvJ7OEFB",
  foto: "nT0MGKF7URJySwZM",
};

const textExpr =
  "={{ ($('Telegram Trigger').item.json.message.text || '').trim().toLowerCase() }}";

function rule(idSuffix, rightValue, outputKey) {
  return {
    conditions: {
      options: {
        caseSensitive: false,
        leftValue: "",
        typeValidation: "loose",
        version: 3,
      },
      conditions: [
        {
          id: `r-${idSuffix}`,
          leftValue: textExpr,
          rightValue,
          operator: { type: "string", operation: "startsWith" },
        },
      ],
      combinator: "and",
    },
    renameOutput: true,
    outputKey,
  };
}

const routerNode = {
  id: ROUTER_ID,
  name: "Router comandos",
  type: "n8n-nodes-base.switch",
  typeVersion: 3.4,
  position: [360, 0],
  parameters: {
    mode: "rules",
    options: { fallbackOutput: "extra" },
    rules: {
      values: [
        rule("gasto", "/gasto", "gasto"),
        rule("cheque", "/cheque", "cheque"),
        rule("prov", "/proveedor", "proveedor"),
        rule("foto", "/fotofactura", "fotofactura"),
      ],
    },
  },
};

function execNode(id, name, workflowId, y) {
  return {
    id,
    name,
    type: "n8n-nodes-base.executeWorkflow",
    typeVersion: 1.3,
    position: [620, y],
    parameters: {
      source: "database",
      workflowId,
      workflowInputs: { mappingMode: "defineBelow", value: {} },
      mode: "each",
      options: {},
    },
  };
}

const execNodes = [
  execNode(EXEC_IDS.gasto, "Execute SF Gasto", SUB_IDS.gasto, -120),
  execNode(EXEC_IDS.cheque, "Execute SF Cheque", SUB_IDS.cheque, -40),
  execNode(EXEC_IDS.proveedor, "Execute SF Factura proveedor", SUB_IDS.proveedor, 40),
  execNode(EXEC_IDS.foto, "Execute SF Factura foto", SUB_IDS.foto, 120),
];

async function api(method, url, body) {
  const opts = {
    method,
    headers: {
      "X-N8N-API-KEY": key,
      "Content-Type": "application/json",
    },
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

const getUrl = `${base}/api/v1/workflows/${WORKFLOW_ID}`;
const wf = await api("GET", getUrl);

const stripIds = new Set([ROUTER_ID, ...Object.values(EXEC_IDS)]);
const nodes = wf.nodes.filter((n) => !stripIds.has(n.id)).concat([routerNode, ...execNodes]);

for (const n of nodes) {
  if (n.name === "OpenAI Chat Model") n.disabled = false;
}

const connections = structuredClone(wf.connections || {});

if (connections.TextoCliente?.main?.[0]) {
  connections.TextoCliente.main[0] = connections.TextoCliente.main[0].filter(
    (c) => c.node !== "AI Agent",
  );
}

connections.TextoCliente = {
  main: [[{ node: "Router comandos", type: "main", index: 0 }]],
};

connections["Router comandos"] = {
  main: [
    [{ node: "Execute SF Gasto", type: "main", index: 0 }],
    [{ node: "Execute SF Cheque", type: "main", index: 0 }],
    [{ node: "Execute SF Factura proveedor", type: "main", index: 0 }],
    [{ node: "Execute SF Factura foto", type: "main", index: 0 }],
    [{ node: "AI Agent", type: "main", index: 0 }],
  ],
};

const putBody = {
  name: wf.name,
  nodes,
  connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
};

const updated = await api("PUT", getUrl, putBody);
console.log("OK:", updated.id, updated.name, "nodes:", updated.nodes?.length);
