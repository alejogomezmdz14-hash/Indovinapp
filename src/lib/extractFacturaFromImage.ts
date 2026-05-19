export type LineaFacturaOcr = { concepto: string; importe: number };

export type FacturaOcrResult = {
  /** true solo si es factura fiscal válida (A, B, C, M). Remitos/pedidos: false. */
  es_factura: boolean;
  tipo_documento: "factura" | "remito" | "pedido" | "otro";
  /** Por qué NO es factura, cuando es_factura=false. */
  motivo_rechazo: string;
  proveedor: string;
  monto_total: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  numero_factura: string;
  condicion_venta: string;
  lineas: LineaFacturaOcr[];
};

function sumDDMMYYYY(fecha: string, dias: number): string {
  const parts = fecha.split("/");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts.map((p) => Number(p));
  if (!d || !m || !y) return "";
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + dias);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function calcularVencimiento(
  fechaVencExplicita: string,
  fechaEmision: string,
  condicion: string,
): string {
  if (fechaVencExplicita) return fechaVencExplicita;
  if (!fechaEmision) return "";
  const c = condicion.toLowerCase();
  if (/contado|efectivo|caja/.test(c)) return fechaEmision;
  const m = c.match(/(\d{1,3})\s*d[ií]as?/);
  if (m) return sumDDMMYYYY(fechaEmision, Number(m[1]));
  return "";
}

function parseJsonFromOpenAI(content: string): FacturaOcrResult {
  const raw = JSON.parse(content) as Record<string, unknown>;

  const tipoRaw = String(raw.tipo_documento ?? "").toLowerCase().trim();
  const tipo_documento: FacturaOcrResult["tipo_documento"] =
    tipoRaw === "factura" || tipoRaw === "remito" || tipoRaw === "pedido"
      ? tipoRaw
      : "otro";
  const es_factura = Boolean(raw.es_factura) && tipo_documento === "factura";

  const fecha_emision = String(raw.fecha_emision ?? raw.fecha ?? "").trim();
  const fecha_venc_explicita = String(raw.fecha_vencimiento ?? "").trim();
  const condicion_venta = String(raw.condicion_venta ?? "").trim();
  const fecha_vencimiento = calcularVencimiento(
    fecha_venc_explicita,
    fecha_emision,
    condicion_venta,
  );

  const proveedor = String(raw.proveedor ?? "").trim();
  const monto_total = Math.abs(Number(raw.monto_total ?? raw.monto ?? 0)) || 0;

  const lineasRaw = Array.isArray(raw.lineas) ? raw.lineas : [];
  const lineas: LineaFacturaOcr[] = lineasRaw.map((l) => {
    const o = l as Record<string, unknown>;
    return {
      concepto: String(o.concepto ?? o.descripcion ?? "").trim(),
      importe: Math.abs(Number(o.importe ?? o.monto ?? 0)),
    };
  });

  return {
    es_factura,
    tipo_documento,
    motivo_rechazo: String(raw.motivo_rechazo ?? "").trim(),
    proveedor,
    monto_total,
    fecha_emision,
    fecha_vencimiento,
    numero_factura: String(raw.numero_factura ?? "").trim(),
    condicion_venta,
    lineas: lineas.filter((x) => x.concepto || x.importe > 0),
  };
}

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

export async function extractFacturaFromImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<FacturaOcrResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no está configurada");
  }

  const b64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${b64}`;

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
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Respuesta vacía de OpenAI");
  }

  return parseJsonFromOpenAI(content);
}
