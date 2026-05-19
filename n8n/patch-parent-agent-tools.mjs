/**
 * Flujo padre Telegram: quita Router + Execute directo; conecta TextoCliente -> AI Agent;
 * añade 4x "Call n8n Sub-Workflow Tool" -> AI Agent (ai_tool) + systemMessage.
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
if (!base || !key) throw new Error("N8N_API_URL and N8N_API_KEY required in .env");

const PARENT_ID = "rFh6ARtAiROZ4Ors";

const REMOVE_IDS = new Set([
  "a1111111-1111-4111-8111-111111111101",
  "a1111111-1111-4111-8111-111111111102",
  "a1111111-1111-4111-8111-111111111103",
  "a1111111-1111-4111-8111-111111111104",
  "a1111111-1111-4111-8111-111111111105",
]);

const TOOLS = [
  {
    id: "e1011111-1111-4111-8111-000000000001",
    name: "Tool SF Gasto",
    workflowId: "OcPG64aOIccaaEZW",
    description:
      "registrar_gasto: registra un gasto o movimiento en libro diario (Supabase + Sheets). Usar cuando el usuario quiera cargar un gasto, un pago, o texto tipo /gasto con monto y detalle.",
    y: -80,
  },
  {
    id: "e1011111-1111-4111-8111-000000000002",
    name: "Tool SF Cheque",
    workflowId: "iOAvoQaSdY7OmNHt",
    description:
      "registrar_cheque: registra un cheque (Supabase + Sheets). Usar con /cheque o cuando hable de cheques a pagar.",
    y: 40,
  },
  {
    id: "e1011111-1111-4111-8111-000000000003",
    name: "Tool SF Factura proveedor",
    workflowId: "CFovQKG2RvJ7OEFB",
    description:
      "registrar_factura_proveedor: factura de proveedor sin foto. Usar con /proveedor o facturas de proveedores.",
    y: 160,
  },
  {
    id: "e1011111-1111-4111-8111-000000000004",
    name: "Tool SF Factura foto",
    workflowId: "nT0MGKF7URJySwZM",
    description:
      "registrar_factura_foto: stub / factura por imagen. Usar con /fotofactura o cuando deba procesarse foto de factura.",
    y: 280,
  },
];

const systemMessage = `Sos el asistente de **Indovina** (español rioplatense).

Tenés herramientas (subflujos) que graban en base y Google Sheets:
- **registrar_gasto** → Tool SF Gasto
- **registrar_cheque** → Tool SF Cheque  
- **registrar_factura_proveedor** → Tool SF Factura proveedor
- **registrar_factura_foto** → Tool SF Factura foto

Si el usuario escribe comandos /gasto, /cheque, /proveedor o /fotofactura, o pide explícitamente registrar algo, **llamá la herramienta adecuada** (podés pasar el texto del usuario como contexto; el subflujo interpreta los datos).

Para saludos, dudas generales o conversación sin registrar movimientos, respondé vos **sin** usar herramientas. Sé breve.`;

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

const url = `${base}/api/v1/workflows/${PARENT_ID}`;
const wf = await api("GET", url);

const nodes = wf.nodes.filter((n) => !REMOVE_IDS.has(n.id));

const toolNodes = TOOLS.map((t) => ({
  id: t.id,
  name: t.name,
  type: "@n8n/n8n-nodes-langchain.toolWorkflow",
  typeVersion: 2.2,
  position: [120, t.y],
  parameters: {
    description: t.description,
    source: "database",
    workflowId: t.workflowId,
    workflowInputs: { mappingMode: "defineBelow", value: {} },
  },
}));

const mergedNodes = [...nodes, ...toolNodes];

for (const n of mergedNodes) {
  if (n.name === "AI Agent") {
    n.parameters = {
      ...n.parameters,
      promptType: "define",
      text: "={{ $json.text || $json.message?.text || $('Telegram Trigger').item.json.message?.text || '' }}",
      options: {
        ...(n.parameters?.options || {}),
        systemMessage,
      },
    };
  }
  if (n.name === "Send a text message") {
    n.parameters = {
      ...n.parameters,
      resource: "message",
      operation: "sendMessage",
    };
  }
}

const connections = {
  "Telegram Trigger": {
    main: [[{ node: "Switch", type: "main", index: 0 }]],
  },
  Switch: {
    main: [
      [{ node: "TextoCliente", type: "main", index: 0 }],
      [{ node: "Get a file", type: "main", index: 0 }],
    ],
  },
  "Get a file": {
    main: [[{ node: "Transcribe a recording", type: "main", index: 0 }]],
  },
  TextoCliente: {
    main: [[{ node: "AI Agent", type: "main", index: 0 }]],
  },
  "Transcribe a recording": {
    main: [[{ node: "AI Agent", type: "main", index: 0 }]],
  },
  "OpenAI Chat Model": {
    ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]],
  },
  "Postgres Chat Memory": {
    ai_memory: [[{ node: "AI Agent", type: "ai_memory", index: 0 }]],
  },
  "AI Agent": {
    main: [[{ node: "Send a text message", type: "main", index: 0 }]],
  },
};

for (const t of TOOLS) {
  connections[t.name] = {
    ai_tool: [[{ node: "AI Agent", type: "ai_tool", index: 0 }]],
  };
}

const putBody = {
  name: wf.name,
  nodes: mergedNodes,
  connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
};

await api("PUT", url, putBody);
console.log("OK parent: tools -> AI Agent, TextoCliente -> AI Agent");
