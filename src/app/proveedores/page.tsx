import {
  fechaHoyArgentina,
  getFacturasProveedores,
  getPagosFacturas,
  getPagosProveedores,
} from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import StatusBadge from "@/components/dashboard/StatusBadge";
import FacturaFotoUploader from "@/components/proveedores/FacturaFotoUploader";
import CuentaFormaSelect from "@/components/proveedores/CuentaFormaSelect";
import { PROVEEDORES_ORDEN } from "@/config/proveedores";
import type { ResumenProveedor } from "@/types";
import resumenes from "@/lib/resumenesFinancieros";

export const dynamic = "force-dynamic";

const { buildResumenProveedores } = resumenes as {
  buildResumenProveedores: (
    facturas: Awaited<ReturnType<typeof getFacturasProveedores>>,
    pagos: Awaited<ReturnType<typeof getPagosProveedores>>,
    imputaciones: Awaited<ReturnType<typeof getPagosFacturas>>,
    today?: Date,
    proveedoresCanonicos?: readonly string[],
  ) => ResumenProveedor[];
};

export default async function ProveedoresPage() {
  const [facturas, pagos, imputaciones] = await Promise.all([
    getFacturasProveedores(),
    getPagosProveedores(),
    getPagosFacturas(),
  ]);
  const proveedores = buildResumenProveedores(
    facturas,
    pagos,
    imputaciones,
    new Date(),
    PROVEEDORES_ORDEN,
  );

  const vencidas = proveedores.filter((p) => p.estado === "vencida");
  const porVencer = proveedores.filter((p) => p.estado === "por_vencer");
  const alDia = proveedores.filter((p) => p.estado === "al_dia");
  const totalDeuda = proveedores.reduce((sum, p) => sum + p.saldo_pendiente, 0);
  const hoy = fechaHoyArgentina();
  const hoyIso = new Date().toISOString().slice(0, 10);

  // Desglose de pagos por (cuenta, forma) — del mes en curso.
  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const anioActual = ahora.getFullYear();
  const pagosDelMes = pagos.filter((p) => {
    if (!p.fecha) return false;
    const parts = p.fecha.includes("/") ? p.fecha.split("/") : null;
    const d = parts
      ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
      : new Date(p.fecha);
    return d.getMonth() === mesActual && d.getFullYear() === anioActual;
  });
  const desglosePagos = new Map<string, { cuenta: string; forma: string; total: number; count: number }>();
  for (const p of pagosDelMes) {
    const key = `${p.cuenta}__${p.forma || "(sin forma)"}`;
    const prev = desglosePagos.get(key) ?? { cuenta: p.cuenta, forma: p.forma || "(sin forma)", total: 0, count: 0 };
    prev.total += p.monto;
    prev.count += 1;
    desglosePagos.set(key, prev);
  }
  const desglosePagosList = Array.from(desglosePagos.values()).sort((a, b) => b.total - a.total);
  const totalPagadoMes = desglosePagosList.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-brand-black tracking-tight">
          Proveedores
        </h1>
        <p className="mt-1 text-sm font-medium text-gray-400">
          Estado de cuenta con proveedores
        </p>
      </div>

      <FacturaFotoUploader />

      <div className="rounded-2xl bg-white p-6 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-brand-black">Pagos por medio - mes actual</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {pagosDelMes.length} pago{pagosDelMes.length !== 1 ? "s" : ""} registrado{pagosDelMes.length !== 1 ? "s" : ""}
            </p>
          </div>
          <span className="text-sm font-bold text-emerald-700">
            Total: {formatCurrency(totalPagadoMes)}
          </span>
        </div>
        {desglosePagosList.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {desglosePagosList.map((d) => (
              <div
                key={`${d.cuenta}-${d.forma}`}
                className="flex items-center justify-between rounded-xl border border-brand-cream-dark bg-brand-cream/40 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-brand-black">{d.cuenta}</p>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">{d.forma}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-brand-black">{formatCurrency(d.total)}</p>
                  <p className="text-[11px] text-gray-400">{d.count} pago{d.count !== 1 ? "s" : ""}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-400">Aún no hay pagos registrados este mes.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-card">
          <div className="absolute top-0 left-0 h-1 w-full bg-red-400" />
          <p className="text-sm font-medium text-gray-500">Proveedores vencidos</p>
          <p className="mt-2 text-2xl font-bold text-brand-wine">{vencidas.length}</p>
          <p className="mt-1 text-xs text-gray-400">
            {formatCurrency(vencidas.reduce((s, p) => s + p.saldo_pendiente, 0))}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-card">
          <div className="absolute top-0 left-0 h-1 w-full bg-amber-400" />
          <p className="text-sm font-medium text-gray-500">Proveedores por vencer</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{porVencer.length}</p>
          <p className="mt-1 text-xs text-gray-400">
            {formatCurrency(porVencer.reduce((s, p) => s + p.saldo_pendiente, 0))}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-card">
          <div className="absolute top-0 left-0 h-1 w-full bg-emerald-400" />
          <p className="text-sm font-medium text-gray-500">Proveedores al día</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{alDia.length}</p>
          <p className="mt-1 text-xs text-gray-400">
            {formatCurrency(alDia.reduce((s, p) => s + p.saldo_pendiente, 0))}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-cream-dark">
          <h3 className="font-bold text-brand-black">Resumen por proveedor</h3>
          <span className="text-sm font-bold text-brand-wine">
            Deuda total: {formatCurrency(totalDeuda)}
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {proveedores.map((proveedor) => (
            <details key={proveedor.proveedor} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-brand-black">{proveedor.proveedor}</p>
                    <StatusBadge variant={proveedor.estado} />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {proveedor.facturas.length} factura{proveedor.facturas.length !== 1 ? "s" : ""} -
                    {" "}Pagado {formatCurrency(proveedor.total_pagado)}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Saldo pendiente
                  </p>
                  <p className="text-lg font-bold text-brand-wine">
                    {formatCurrency(proveedor.saldo_pendiente)}
                  </p>
                </div>
              </summary>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-brand-cream text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-3">Referencia</th>
                      <th className="px-4 py-3 text-right">Factura</th>
                      <th className="px-4 py-3 text-right">Pagado</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3">Vencimiento</th>
                      <th className="px-4 py-3">Carga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proveedor.facturas.map((factura) => (
                      <tr key={factura.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-brand-black">
                          {factura.referencia || "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-brand-black">
                          {formatCurrency(factura.monto)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          {formatCurrency(factura.monto_pagado)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-brand-wine">
                          {formatCurrency(factura.saldo_pendiente)}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{factura.fecha_vencimiento}</td>
                        <td className="px-4 py-3 text-gray-500">{factura.fecha_carga || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form
                action="/api/proveedores/pagos"
                method="post"
                className="mt-5 rounded-xl border border-brand-cream-dark bg-brand-cream/40 p-4"
              >
                <input type="hidden" name="proveedor" value={proveedor.proveedor} />
                <h4 className="font-semibold text-brand-black">Registrar pago e imputarlo</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Fecha pago
                    <input
                      name="fecha"
                      defaultValue={hoy}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-brand-black"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Fecha carga
                    <input
                      type="date"
                      name="fecha_carga"
                      defaultValue={hoyIso}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-brand-black"
                    />
                  </label>
                  <CuentaFormaSelect />
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Comentario
                    <input
                      name="comentario"
                      placeholder="Opcional"
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-brand-black"
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-2">
                  {proveedor.facturas
                    .filter((factura) => factura.saldo_pendiente > 0)
                    .map((factura) => (
                      <label
                        key={factura.id}
                        className="grid gap-2 rounded-lg bg-white p-3 text-sm sm:grid-cols-[1fr_180px] sm:items-center"
                      >
                        <span className="text-gray-600">
                          {factura.referencia || factura.fecha_vencimiento} - saldo{" "}
                          <strong className="text-brand-black">
                            {formatCurrency(factura.saldo_pendiente)}
                          </strong>
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={factura.saldo_pendiente}
                          name={`factura:${factura.id}`}
                          placeholder="Monto a aplicar"
                          className="rounded-lg border border-gray-200 px-3 py-2 text-right"
                        />
                      </label>
                    ))}
                  {proveedor.facturas.every((factura) => factura.saldo_pendiente <= 0) && (
                    <p className="rounded-lg bg-white p-3 text-sm text-emerald-700">
                      Este proveedor no tiene facturas pendientes.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="mt-4 rounded-xl bg-brand-black px-4 py-2 text-sm font-semibold text-brand-gold shadow-btn transition hover:-translate-y-0.5"
                >
                  Guardar pago
                </button>
              </form>
            </details>
          ))}
          {proveedores.length === 0 && (
            <p className="px-6 py-12 text-center text-gray-400">
              No hay facturas registradas
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
