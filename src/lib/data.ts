import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ordenarCuentasCanonico } from "@/config/cuentas";
import type {
  Movimiento,
  Cuenta,
  Cheque,
  FacturaProveedor,
  IngresoDesglose,
  PagoFactura,
  PagoProveedor,
} from "@/types";

type MovimientoInput = Omit<Movimiento, "id" | "cuenta" | "fecha_carga"> &
  Partial<Pick<Movimiento, "cuenta" | "fecha_carga">>;

function isMissingSchemaError(error: { code?: string; message?: string } | null): boolean {
  const msg = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    msg.includes("could not find") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

function diffDays(target: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function parseDate(raw: string): Date {
  if (raw.includes("/")) {
    const [day, month, year] = raw.split("/");
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(raw);
}

export function fechaHoyArgentina(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function getCuentas(): Promise<Cuenta[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cuentas")
    .select("nombre, saldo");
  if (error) throw new Error(`Supabase cuentas: ${error.message}`);

  const cuentas: Cuenta[] = (data ?? []).map((r) => ({
    nombre: String(r.nombre ?? ""),
    saldo: Number(r.saldo) || 0,
  }));
  return ordenarCuentasCanonico(cuentas);
}

export async function getMovimientos(): Promise<Movimiento[]> {
  const supabase = createSupabaseServerClient();
  const selectWithNewFields =
    "id, fecha, monto, proveedor, categoria, comentario, tipo_comprobante, numero_comprobante, fecha_vencimiento, cuenta, fecha_carga";
  const selectLegacy =
    "id, fecha, monto, proveedor, categoria, comentario, tipo_comprobante, numero_comprobante, fecha_vencimiento";
  const result = await supabase
    .from("movimientos")
    .select(selectWithNewFields)
    .order("created_at", { ascending: false });
  let data: Array<Record<string, unknown>> | null = result.data;
  let error = result.error;
  if (error && isMissingSchemaError(error)) {
    const fallback = await supabase
      .from("movimientos")
      .select(selectLegacy)
      .order("created_at", { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(`Supabase movimientos: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: String(r.id ?? ""),
    fecha: String(r.fecha ?? ""),
    fecha_carga: String(r.fecha_carga ?? ""),
    cuenta: String(r.cuenta ?? ""),
    monto: Number(r.monto) || 0,
    proveedor: String(r.proveedor ?? ""),
    categoria: String(r.categoria ?? ""),
    comentario: String(r.comentario ?? ""),
    tipo_comprobante: String(r.tipo_comprobante ?? ""),
    numero_comprobante: String(r.numero_comprobante ?? ""),
    fecha_vencimiento: String(r.fecha_vencimiento ?? ""),
  }));
}

export async function getCheques(): Promise<Cheque[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cheques")
    .select("id, proveedor, monto, fecha_vencimiento");
  if (error) throw new Error(`Supabase cheques: ${error.message}`);

  return (data ?? []).map((r) => {
    const fechaVencimiento = r.fecha_vencimiento ?? "";
    const dias = diffDays(parseDate(fechaVencimiento));
    let estado: Cheque["estado"];
    if (dias < 5) estado = "urgente";
    else if (dias < 10) estado = "esta_semana";
    else estado = "tiempo";
    return {
      id: String(r.id),
      proveedor: r.proveedor ?? "",
      monto: Number(r.monto) || 0,
      fecha_vencimiento: fechaVencimiento,
      estado,
    };
  });
}

export async function getFacturasProveedores(): Promise<FacturaProveedor[]> {
  const supabase = createSupabaseServerClient();
  const selectWithNewFields =
    "id, referencia, proveedor, monto, fecha_vencimiento, fecha_carga, foto_url";
  const selectLegacy = "id, referencia, proveedor, monto, fecha_vencimiento";
  const result = await supabase
    .from("facturas_proveedor")
    .select(selectWithNewFields);
  let data: Array<Record<string, unknown>> | null = result.data;
  let error = result.error;
  if (error && isMissingSchemaError(error)) {
    const fallback = await supabase.from("facturas_proveedor").select(selectLegacy);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(`Supabase facturas_proveedor: ${error.message}`);

  return (data ?? []).map((r) => {
    const fechaVencimiento = String(r.fecha_vencimiento ?? "");
    const dias = diffDays(parseDate(fechaVencimiento));
    let estado: FacturaProveedor["estado"];
    if (dias < 0) estado = "vencida";
    else if (dias < 7) estado = "por_vencer";
    else estado = "al_dia";
    return {
      id: String(r.id ?? ""),
      referencia: String(r.referencia ?? ""),
      proveedor: String(r.proveedor ?? ""),
      monto: Number(r.monto) || 0,
      fecha_vencimiento: fechaVencimiento,
      fecha_carga: String(r.fecha_carga ?? ""),
      foto_url: String(r.foto_url ?? ""),
      estado,
    };
  });
}

export async function getPagosProveedores(): Promise<PagoProveedor[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pagos_proveedor")
    .select("id, fecha, fecha_carga, proveedor, cuenta, monto, comentario")
    .order("created_at", { ascending: false });
  if (error && isMissingSchemaError(error)) return [];
  if (error) throw new Error(`Supabase pagos_proveedor: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: String(r.id),
    fecha: r.fecha ?? "",
    fecha_carga: r.fecha_carga ?? "",
    proveedor: r.proveedor ?? "",
    cuenta: r.cuenta ?? "",
    monto: Number(r.monto) || 0,
    comentario: r.comentario ?? "",
  }));
}

export async function getPagosFacturas(): Promise<PagoFactura[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("pagos_facturas")
    .select("id, pago_id, factura_id, monto_aplicado");
  if (error && isMissingSchemaError(error)) return [];
  if (error) throw new Error(`Supabase pagos_facturas: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: String(r.id),
    pago_id: String(r.pago_id),
    factura_id: String(r.factura_id),
    monto_aplicado: Number(r.monto_aplicado) || 0,
  }));
}

export async function getIngresosDesglose(): Promise<IngresoDesglose[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ingresos_desglose")
    .select("id, movimiento_id, cuenta, forma, monto");
  if (error && isMissingSchemaError(error)) return [];
  if (error) throw new Error(`Supabase ingresos_desglose: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: String(r.id),
    movimiento_id: String(r.movimiento_id),
    cuenta: r.cuenta ?? "",
    forma: r.forma ?? "",
    monto: Number(r.monto) || 0,
  }));
}

export async function appendMovimiento(mov: MovimientoInput): Promise<void> {
  const supabase = createSupabaseServerClient();
  const legacyPayload = {
    fecha: mov.fecha,
    monto: mov.monto,
    proveedor: mov.proveedor,
    categoria: mov.categoria,
    comentario: mov.comentario,
    tipo_comprobante: mov.tipo_comprobante,
    numero_comprobante: mov.numero_comprobante,
    fecha_vencimiento: mov.fecha_vencimiento,
    origen: "foto",
  };
  const payload = {
    ...legacyPayload,
    cuenta: mov.cuenta ?? "",
    ...(mov.fecha_carga ? { fecha_carga: mov.fecha_carga } : {}),
  };
  let { error } = await supabase.from("movimientos").insert(payload);
  if (error && isMissingSchemaError(error)) {
    const fallback = await supabase.from("movimientos").insert(legacyPayload);
    error = fallback.error;
  }
  if (error) throw new Error(`Supabase insert movimiento: ${error.message}`);
}

export async function appendFacturaProveedor(
  referencia: string,
  proveedor: string,
  monto: number,
  fecha_vencimiento: string,
  foto_url: string = "",
  fecha_carga: string = "",
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const legacyPayload = {
    referencia,
    proveedor,
    monto,
    fecha_vencimiento,
    foto_url,
  };
  const payload = {
    ...legacyPayload,
    ...(fecha_carga ? { fecha_carga } : {}),
  };
  let { error } = await supabase.from("facturas_proveedor").insert(payload);
  if (error && isMissingSchemaError(error)) {
    const fallback = await supabase.from("facturas_proveedor").insert(legacyPayload);
    error = fallback.error;
  }
  if (error) throw new Error(`Supabase insert factura_proveedor: ${error.message}`);
}
