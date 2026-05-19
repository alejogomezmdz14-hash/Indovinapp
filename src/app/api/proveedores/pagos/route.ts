import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function parseAmount(raw: FormDataEntryValue | null): number {
  if (typeof raw !== "string") return 0;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  return Number(normalized) || 0;
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const form = await req.formData();
  const proveedor = String(form.get("proveedor") ?? "").trim();
  const fecha = String(form.get("fecha") ?? "").trim();
  const fechaCarga = String(form.get("fecha_carga") ?? "").trim();
  const cuenta = String(form.get("cuenta") ?? "").trim();
  const comentario = String(form.get("comentario") ?? "").trim();

  const imputaciones = Array.from(form.entries())
    .filter(([key]) => key.startsWith("factura:"))
    .map(([key, value]) => ({
      factura_id: key.replace("factura:", ""),
      monto_aplicado: parseAmount(value),
    }))
    .filter((i) => i.factura_id && i.monto_aplicado > 0);

  const monto = imputaciones.reduce((sum, i) => sum + i.monto_aplicado, 0);
  if (!proveedor || !fecha || !cuenta || monto <= 0 || imputaciones.length === 0) {
    return NextResponse.json(
      { error: "Faltan datos para registrar el pago." },
      { status: 400 },
    );
  }

  const { data: pago, error: pagoError } = await supabase
    .from("pagos_proveedor")
    .insert({
      proveedor,
      fecha,
      fecha_carga: fechaCarga || undefined,
      cuenta,
      monto,
      comentario,
      origen: "app",
    })
    .select("id")
    .single();

  if (pagoError) {
    return NextResponse.json({ error: pagoError.message }, { status: 500 });
  }

  const { error: imputacionError } = await supabase.from("pagos_facturas").insert(
    imputaciones.map((i) => ({
      pago_id: pago.id,
      factura_id: i.factura_id,
      monto_aplicado: i.monto_aplicado,
    })),
  );

  if (imputacionError) {
    return NextResponse.json({ error: imputacionError.message }, { status: 500 });
  }

  revalidatePath("/proveedores");
  revalidatePath("/");
  return NextResponse.redirect(new URL("/proveedores", req.url), 303);
}
