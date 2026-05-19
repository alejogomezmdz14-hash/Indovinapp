/**
 * Test standalone del OCR de facturas. NO toca Drive ni Supabase.
 *
 * Uso:
 *   node scripts/test-ocr-factura.mjs "C:/ruta/a/factura.jpeg"
 *
 * Requiere OPENAI_API_KEY en .env o .env.local.
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

const apiKey = env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Falta OPENAI_API_KEY en .env o .env.local");
  process.exit(1);
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Uso: node scripts/test-ocr-factura.mjs <ruta-a-imagen>");
  process.exit(1);
}
if (!fs.existsSync(imagePath)) {
  console.error(`No existe el archivo: ${imagePath}`);
  process.exit(1);
}

const ext = path.extname(imagePath).slice(1).toLowerCase();
const mime =
  ext === "jpg" || ext === "jpeg"
    ? "image/jpeg"
    : ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/jpeg";

const buffer = fs.readFileSync(imagePath);
const b64 = buffer.toString("base64");
const dataUrl = `data:${mime};base64,${b64}`;

const SYSTEM_PROMPT = `Sos asistente contable para Argentina. Analizás imágenes de comprobantes de proveedores.

Respondé SOLO un JSON válido (sin markdown) con esta forma EXACTA:
{
  "es_factura": boolean,
  "tipo_documento": "factura" | "remito" | "pedido" | "otro",
  "motivo_rechazo": "texto corto si NO es factura, vacío si sí",
  "proveedor": "razón social del emisor",
  "monto_total": número (TOTAL final con IVA y percepciones, NO subtotal),
  "fecha_emision": "dd/mm/aaaa",
  "fecha_vencimiento": "dd/mm/aaaa o vacío si solo figura condición de venta",
  "numero_factura": "número completo (ej. 0002-00098591)",
  "condicion_venta": "texto exacto que aparezca (ej. 'CUENTA CORRIENTE 15 DIAS', 'CONTADO', 'PAGO CONTADO')",
  "lineas": [ { "concepto": "ítem", "importe": número (subtotal del ítem) } ]
}

REGLAS CRÍTICAS:

1. Tipo de documento:
   - "factura" SOLO si la imagen muestra explícitamente la palabra "FACTURA" o "FACTURA A/B/C/M" en el encabezado. Es un comprobante fiscal con CUIT del emisor y CAE.
   - "remito" si dice "REMITO" o "DOCUMENTO NO VÁLIDO COMO FACTURA".
   - "pedido" si dice "PEDIDO", "NOTA DE PEDIDO", "ORDEN DE COMPRA".
   - "otro" para todo lo demás.
   - es_factura = true SOLO si tipo_documento = "factura".
   - Si NO es factura, completá motivo_rechazo con una frase clara (ej. "Es un remito, no una factura").

2. Monto total: usá SIEMPRE el TOTAL final (la cifra más grande, la que incluye IVA 21%/10.5% y percepciones). NO uses subtotal.

3. Fecha de emisión: la "Fecha" del comprobante (NO "Fecha de Vto. de CAE" — eso es AFIP, no pago).

4. Fecha de vencimiento:
   - Si figura EXPLÍCITAMENTE una "Fecha de Vto." de pago (distinta de la del CAE), ponéla.
   - Si solo figura condición tipo "Cuenta corriente 15 días" o "Contado", dejá fecha_vencimiento vacía y completá condicion_venta — el sistema la calcula después.
   - NUNCA uses la "Fecha de Vto. de CAE" como fecha_vencimiento.

5. Si la imagen está borrosa o no podés leer un campo, dejalo vacío en vez de inventar.`;

function sumDDMMYYYY(fecha, dias) {
  const parts = fecha.split("/");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts.map((p) => Number(p));
  if (!d || !m || !y) return "";
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + dias);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function calcularVencimiento(fechaVencExplicita, fechaEmision, condicion) {
  if (fechaVencExplicita) return fechaVencExplicita;
  if (!fechaEmision) return "";
  const c = condicion.toLowerCase();
  if (/contado|efectivo|caja/.test(c)) return fechaEmision;
  const m = c.match(/(\d{1,3})\s*d[ií]as?/);
  if (m) return sumDDMMYYYY(fechaEmision, Number(m[1]));
  return "";
}

const t0 = Date.now();
const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extraé los datos del comprobante siguiendo las reglas. JSON puro, sin markdown.",
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    max_tokens: 1500,
    temperature: 0.1,
  }),
});

if (!res.ok) {
  const err = await res.text();
  console.error(`OpenAI error ${res.status}:`, err.slice(0, 500));
  process.exit(1);
}

const data = await res.json();
const content = data.choices?.[0]?.message?.content || "{}";
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

let parsed;
try {
  parsed = JSON.parse(content);
} catch (e) {
  console.error("OpenAI devolvió JSON inválido:");
  console.error(content);
  process.exit(1);
}

const fechaVencFinal = calcularVencimiento(
  parsed.fecha_vencimiento || "",
  parsed.fecha_emision || "",
  parsed.condicion_venta || "",
);

console.log("\n=== OCR resultado ===");
console.log(`Archivo: ${path.basename(imagePath)}`);
console.log(`Tiempo:  ${elapsed}s`);
console.log("");
console.log(JSON.stringify(parsed, null, 2));
console.log("");
console.log("=== Lo que cargaría el sistema ===");
if (!parsed.es_factura) {
  console.log(`❌ RECHAZA — ${parsed.motivo_rechazo || "no es factura"}`);
} else {
  console.log(`✅ Carga factura`);
  console.log(`   Proveedor:    ${parsed.proveedor}`);
  console.log(`   Total:        $${parsed.monto_total}`);
  console.log(`   Nº factura:   ${parsed.numero_factura}`);
  console.log(`   Emisión:      ${parsed.fecha_emision}`);
  console.log(`   Vencimiento:  ${fechaVencFinal || "(vacío)"} ${fechaVencFinal !== parsed.fecha_vencimiento ? `[calculado de "${parsed.condicion_venta}"]` : ""}`);
  console.log(`   Condición:    ${parsed.condicion_venta || "(no figura)"}`);
}
