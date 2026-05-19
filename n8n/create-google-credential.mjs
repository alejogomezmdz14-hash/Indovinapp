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

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${base}${path}`, opts);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const schema = await api("GET", "/api/v1/credentials/schema/googleApi");
console.log("schema status", schema.status);

const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let privateKey = env.GOOGLE_PRIVATE_KEY;
if (!email || !privateKey) {
  console.error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY in .env");
  process.exit(1);
}
privateKey = privateKey.replace(/\\n/g, "\n");

const { status, data } = await api("POST", "/api/v1/credentials", {
  name: "Indovina Google Service Account",
  type: "googleApi",
  data: {
    email,
    privateKey,
    inpersonate: false,
    httpNode: false,
  },
});

if (status >= 400) {
  console.error("Create credential failed:", status, typeof data === "string" ? data : JSON.stringify(data));
  process.exit(1);
}

console.log("Created credential id:", data.id, "name:", data.name);
fs.writeFileSync(path.join(__dirname, "._google_cred_id.txt"), data.id, "utf8");
