import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { extractFacturaFromImage } from "@/lib/extractFacturaFromImage";
import {
  appendFacturaProveedor,
  appendMovimiento as appendMovimientoSupabase,
  fechaHoyArgentina,
} from "@/lib/data";
import {
  appendFacturaProveedorFila as appendFacturaSheets,
  appendMovimiento as appendMovimientoSheets,
} from "@/lib/googleSheets";
import { uploadInvoiceImage, sanitizeFilename } from "@/lib/drive";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

type Movimiento = Parameters<typeof appendMovimientoSupabase>[0];

function logMirrorFailure(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[mirror] ${label} falló: ${msg}`);
}

async function persistirMovimiento(mov: Movimiento) {
  await appendMovimientoSupabase(mov);
  try {
    await appendMovimientoSheets(mov);
  } catch (err) {
    logMirrorFailure("movimiento (sheets)", err);
  }
}

function resumenLineas(lineas: { concepto: string }[]): string {
  if (lineas.length === 0) return "Total factura";
  const conceptos = lineas
    .map((l) => l.concepto)
    .filter(Boolean)
    .slice(0, 6)
    .join(" · ");
  return conceptos || "Total factura";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("foto");
    if (!file || typeof (file as Blob).arrayBuffer !== "function") {
      return NextResponse.json(
        { error: "Falta la imagen (campo foto)." },
        { status: 400 },
      );
    }

    const blob = file as Blob;
    if (blob.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "La imagen supera 8 MB. Sacá otra con menos resolución." },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const mime = blob.type || "image/jpeg";
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(mime)) {
      return NextResponse.json(
        { error: "Formato no soportado. Usá JPG, PNG o WebP." },
        { status: 400 },
      );
    }

    const data = await extractFacturaFromImage(buffer, mime);

    if (!data.es_factura) {
      const motivo =
        data.motivo_rechazo ||
        (data.tipo_documento === "remito"
          ? "La foto es de un remito, no de una factura."
          : data.tipo_documento === "pedido"
            ? "La foto es de un pedido, no de una factura."
            : "El documento no es una factura fiscal válida.");
      return NextResponse.json(
        {
          error: `${motivo} Esperá la factura oficial y volvé a subirla.`,
          tipo_documento: data.tipo_documento,
        },
        { status: 422 },
      );
    }

    if (!data.proveedor || data.monto_total <= 0) {
      return NextResponse.json(
        {
          error:
            "No se pudo leer el proveedor o el monto en la foto. Probá con mejor luz o más cerca.",
        },
        { status: 422 },
      );
    }

    let fotoUrl = "";
    try {
      const driveFile = await uploadInvoiceImage(
        buffer,
        mime,
        sanitizeFilename(data.proveedor || "factura", mime),
      );
      fotoUrl = driveFile.webViewLink;
    } catch (err) {
      logMirrorFailure("upload Drive", err);
    }

    const hoy = fechaHoyArgentina();
    const fechaMovimiento = data.fecha_emision || hoy;
    const fechaVencimiento = data.fecha_vencimiento || "";
    const refBase = data.numero_factura || "FOTO";
    const referencia = `${refBase} ${hoy}`.trim();
    const comentario = resumenLineas(data.lineas);

    await appendFacturaProveedor(
      referencia,
      data.proveedor,
      data.monto_total,
      fechaVencimiento,
      fotoUrl,
    );
    try {
      await appendFacturaSheets(
        referencia,
        data.proveedor,
        data.monto_total,
        fechaVencimiento,
        fotoUrl,
      );
    } catch (err) {
      logMirrorFailure("factura proveedor (sheets)", err);
    }

    await persistirMovimiento({
      fecha: fechaMovimiento,
      monto: -data.monto_total,
      proveedor: data.proveedor,
      categoria: "Factura (foto)",
      comentario,
      tipo_comprobante: "Factura",
      numero_comprobante: data.numero_factura || referencia,
      fecha_vencimiento: fechaVencimiento,
      forma: "",
    });

    revalidatePath("/proveedores");
    revalidatePath("/");
    revalidatePath("/libro-diario");

    return NextResponse.json({
      ok: true,
      proveedor: data.proveedor,
      monto_total: data.monto_total,
      numero_factura: data.numero_factura,
      fecha_emision: data.fecha_emision,
      fecha_vencimiento: fechaVencimiento,
      condicion_venta: data.condicion_venta,
      foto_url: fotoUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al procesar la factura";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
