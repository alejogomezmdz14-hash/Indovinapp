/**
 * Reemplaza el contenido de la pestaña "Cuentas " del Sheet por las 5 cuentas canónicas
 * post migration 007. Solo toca A2:B (mantiene el header de la fila 1).
 *
 * Cuentas finales (orden):
 *   SANTANDER VALENCHO
 *   SANTANDER FRANCISCO
 *   VALENCHO MERCADO PAGO
 *   FRANCISCO MERCADO PAGO
 *   EFECTIVO
 *
 * NO toca saldos del Sheet (los pone en 0); la fuente de verdad de saldos
 * es Supabase. El sheet de cuentas es solo legado.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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

const env = loadEnv(path.join(root, ".env"));
const spreadsheetId = env.GOOGLE_SHEET_ID;
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const CUENTAS_FINALES = [
  ["SANTANDER VALENCHO", 0],
  ["SANTANDER FRANCISCO", 0],
  ["VALENCHO MERCADO PAGO", 0],
  ["FRANCISCO MERCADO PAGO", 0],
  ["EFECTIVO", 0],
];

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const title = (meta.data.sheets || [])
    .map((s) => s.properties?.title)
    .find((t) => t === "Cuentas " || t === "Cuentas" || (t && t.trim() === "Cuentas"));
  if (!title) throw new Error('No encontré pestaña "Cuentas " o "Cuentas".');
  const escaped = `'${title.replace(/'/g, "''")}'`;

  // Limpia A2:B100 y escribe las 5 filas nuevas.
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${escaped}!A2:B100`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${escaped}!A2:B${1 + CUENTAS_FINALES.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: CUENTAS_FINALES },
  });
  console.log(`[OK] Sheet "${title}" sincronizado a 5 cuentas.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
