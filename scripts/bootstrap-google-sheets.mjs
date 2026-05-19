/**
 * Crea pestañas y cabeceras en Google Sheets según src/lib/googleSheets.ts (nombres exactos).
 * Idempotente: no duplica pestañas; rellena filas de cuentas solo si la hoja está vacía.
 *
 * Uso: node scripts/bootstrap-google-sheets.mjs
 * Requiere .env: GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

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
const spreadsheetId = env.GOOGLE_SHEET_ID;
const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let privateKey = env.GOOGLE_PRIVATE_KEY;
if (!spreadsheetId || !clientEmail || !privateKey) {
  console.error("Faltan GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY en .env");
  process.exit(1);
}
privateKey = privateKey.replace(/\\n/g, "\n");

/** Igual que en googleSheets.ts — la pestaña "Cuentas " lleva un espacio al final. */
const TAB_CUENTAS = "Cuentas ";
const TAB_LIBRO = "Libro diario";
const TAB_CHEQUES = "cheques";
const TAB_PROVEEDORES = "proveedores";

const CUENTAS_SEED = [
  ["VALENCHO MERCADO PAGO 1", 0],
  ["VALENCHO MERCADO PAGO 2", 0],
  ["VALENCHO SANTANDER", 0],
  ["FRANCISCO MERCADO PAGO", 0],
  ["FRANCISCO SANTANDER", 0],
  ["EFECTIVO", 0],
];

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function existingTitles() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return new Set(
    (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean),
  );
}

async function addSheet(title) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
  console.log("Creada pestaña:", JSON.stringify(title));
}

async function updateRange(range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  console.log("Escrito:", range);
}

async function appendRows(range, rows) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
  console.log("Append", rows.length, "filas →", range);
}

async function rowCount(tab, colEnd) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tab.replace(/'/g, "''")}'!A2:${colEnd}10000`,
  });
  const rows = res.data.values || [];
  return rows.filter((r) => r && r.some((c) => c !== "" && c != null)).length;
}

async function main() {
  const titles = await existingTitles();

  const needed = [TAB_LIBRO, TAB_CUENTAS, TAB_CHEQUES, TAB_PROVEEDORES];
  for (const t of needed) {
    if (!titles.has(t)) {
      await addSheet(t);
      titles.add(t);
    } else {
      console.log("Ya existe:", JSON.stringify(t));
    }
  }

  await updateRange(`'${TAB_LIBRO}'!A1:H1`, [
    [
      "Fecha",
      "Monto",
      "Proveedor",
      "Categoria",
      "Comentario",
      "Tipo comprobante",
      "Numero comprobante",
      "Fecha vencimiento",
    ],
  ]);

  await updateRange(`'${TAB_CUENTAS}'!A1:B1`, [["Nombre", "Saldo"]]);

  await updateRange(`'${TAB_CHEQUES}'!A1:D1`, [
    ["Referencia", "Proveedor", "Monto", "Fecha vencimiento"],
  ]);

  await updateRange(`'${TAB_PROVEEDORES}'!A1:D1`, [
    ["Referencia", "Proveedor", "Monto", "Fecha vencimiento"],
  ]);

  const cuentasDataRows = await rowCount(TAB_CUENTAS, "B");
  if (cuentasDataRows === 0) {
    await appendRows(`'${TAB_CUENTAS}'!A:B`, CUENTAS_SEED);
  } else {
    console.log("Cuentas: ya hay", cuentasDataRows, "filas de datos (no se duplica seed).");
  }

  console.log("\nListo. Compartí la planilla con", clientEmail, "como editor si aún no.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
