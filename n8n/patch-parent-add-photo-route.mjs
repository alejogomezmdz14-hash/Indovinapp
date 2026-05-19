/**
 * Agrega al flujo padre (rFh6ARtAiROZ4Ors) una rama "photo" en el Switch:
 *   message.photo[*].file_id → Get a file (foto) → Preparar input foto → Execute SF Factura foto
 *
 * Idempotente: si ya existe la rama o los nodos (por id), los reemplaza.
 * No toca las ramas existentes "text" y "audio".
 *
 * Lee N8N_API_URL y N8N_API_KEY desde .env.
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

const PARENT_ID = "rFh6ARtAiROZ4Ors";
const SF_FOTO_ID = "nT0MGKF7URJySwZM";

// Credencial Telegram que ya usa el "Get a file" actual del padre.
const TELEGRAM_CRED_ID = "vIYEwFVlRVRV1GSK";
const TELEGRAM_CRED_NAME = "Telegram account";

// IDs estables (mismos en re-runs).
const NODE_ID_GET_FILE_FOTO = "b2000001-0001-4000-8000-000000000001";
const NODE_ID_PREPARAR_FOTO = "b2000001-0001-4000-8000-000000000002";
const NODE_ID_EXEC_SF_FOTO = "b2000001-0001-4000-8000-000000000003";
const SWITCH_RULE_ID_FOTO = "fa11bafe-0000-4000-8000-000000000001";

const NAME_GET_FILE_FOTO = "Get a file (foto)";
const NAME_PREPARAR_FOTO = "Preparar input foto";
const NAME_EXEC_SF_FOTO = "Execute SF Factura foto";

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

const wfUrl = `${base}/api/v1/workflows/${PARENT_ID}`;
const wf = await api("GET", wfUrl);

const switchNode = wf.nodes.find((n) => n.name === "Switch");
if (!switchNode) throw new Error("No encontré el nodo 'Switch' en el padre.");

// 1) Modificar Switch: agregar (o reemplazar) la rule "photo".
const rules = switchNode.parameters?.rules?.values ?? [];
const filteredRules = rules.filter((r) => r?.outputKey !== "photo");
const photoRule = {
  conditions: {
    options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 3 },
    conditions: [
      {
        id: SWITCH_RULE_ID_FOTO,
        leftValue: "={{ $json.message.photo }}",
        rightValue: "",
        operator: { type: "array", operation: "exists", singleValue: true },
      },
    ],
    combinator: "and",
  },
  renameOutput: true,
  outputKey: "photo",
};
switchNode.parameters = {
  ...(switchNode.parameters || {}),
  rules: { values: [...filteredRules, photoRule] },
};

// 2) Nodos nuevos.
const getFileFotoNode = {
  id: NODE_ID_GET_FILE_FOTO,
  name: NAME_GET_FILE_FOTO,
  type: "n8n-nodes-base.telegram",
  typeVersion: 1.2,
  position: [-912, 280],
  parameters: {
    resource: "file",
    fileId:
      "={{ $json.message.photo[$json.message.photo.length - 1].file_id }}",
    additionalFields: {},
  },
  credentials: {
    telegramApi: { id: TELEGRAM_CRED_ID, name: TELEGRAM_CRED_NAME },
  },
};

const prepararFotoNode = {
  id: NODE_ID_PREPARAR_FOTO,
  name: NAME_PREPARAR_FOTO,
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position: [-688, 280],
  parameters: {
    assignments: {
      assignments: [
        {
          id: "set-chat-id",
          name: "chat_id",
          value: "={{ $('Telegram Trigger').item.json.message.chat.id }}",
          type: "number",
        },
      ],
    },
    includeOtherFields: true,
    options: {},
  },
};

const execSfFotoNode = {
  id: NODE_ID_EXEC_SF_FOTO,
  name: NAME_EXEC_SF_FOTO,
  type: "n8n-nodes-base.executeWorkflow",
  typeVersion: 1.3,
  position: [-464, 280],
  parameters: {
    source: "database",
    workflowId: { __rl: true, value: SF_FOTO_ID, mode: "id" },
    workflowInputs: { mappingMode: "defineBelow", value: {} },
    mode: "each",
    options: {},
  },
};

// 3) Limpiar nodos previos (por id o por nombre) y añadir los nuevos.
const dropIds = new Set([NODE_ID_GET_FILE_FOTO, NODE_ID_PREPARAR_FOTO, NODE_ID_EXEC_SF_FOTO]);
const dropNames = new Set([NAME_GET_FILE_FOTO, NAME_PREPARAR_FOTO, NAME_EXEC_SF_FOTO]);
const nodes = wf.nodes
  .filter((n) => !dropIds.has(n.id) && !dropNames.has(n.name))
  .concat([getFileFotoNode, prepararFotoNode, execSfFotoNode]);

// 4) Conexiones: Switch.main[2] → Get a file (foto) → Preparar input foto → Execute SF Factura foto.
const connections = structuredClone(wf.connections || {});

const switchConn = connections["Switch"] || { main: [] };
const switchMain = Array.isArray(switchConn.main) ? switchConn.main : [];
// Aseguramos índices 0 (text), 1 (audio), 2 (photo).
while (switchMain.length < 3) switchMain.push([]);
switchMain[2] = [{ node: NAME_GET_FILE_FOTO, type: "main", index: 0 }];
connections["Switch"] = { ...switchConn, main: switchMain };

connections[NAME_GET_FILE_FOTO] = {
  main: [[{ node: NAME_PREPARAR_FOTO, type: "main", index: 0 }]],
};
connections[NAME_PREPARAR_FOTO] = {
  main: [[{ node: NAME_EXEC_SF_FOTO, type: "main", index: 0 }]],
};
connections[NAME_EXEC_SF_FOTO] = { main: [[]] };

const putBody = {
  name: wf.name,
  nodes,
  connections,
  settings: wf.settings || {},
  staticData: wf.staticData ?? null,
};

const updated = await api("PUT", wfUrl, putBody);
console.log("OK padre:", updated.id, "| nodes:", updated.nodes?.length);
