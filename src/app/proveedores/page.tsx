import {
  fechaHoyArgentina,
  getFacturasProveedores,
  getPagosFacturas,
  getPagosProveedores,
} from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import StatusBadge from "@/components/dashboard/StatusBadge";
import FacturaFotoUploader from "@/components/proveedores/FacturaFotoUploader";
import { CUENTAS_ORDEN } from "@/config/cuentas";
import type { ResumenProveedor } from "@/types";
import resumenes from "@/lib/resumenesFinancieros";

export const dynamic = "force-dynamic";

const { buildResumenProveedores } = resumenes as {
  buildResumenProveedores: (
    facturas: Awaited<ReturnType<typeof getFacturasProveedores>>,
    pagos: Awaited<ReturnType<typeof getPagosProveedores>>,
    imputaciones: Awaited<ReturnType<typeof getPagosFacturas>>,
  ) => ResumenProveedor[];
};

export default async function ProveedoresPage() {
  const [facturas, pagos, imputaciones] = await Promise.all([
    getFacturasProveedores(),
    getPagosProveedores(),
    getPagosFacturas(),
  ]);
  const proveedores = buildResumenProveedores(facturas, pagos, imputaciones);

  const vencidas = proveedores.filter((p) => p.estado === "vencida");
  const porVencer = proveedores.filter((p) => p.estado === "por_vencer");
  const alDia = proveedores.filter((p) => p.estado === "al_dia");
  const totalDeuda = proveedores.reduce((sum, p) => sum + p.saldo_pendiente, 0);
  const hoy = fechaHoyArgentina();
  const hoyIso = new Date().toISOString().slice(0, 10);

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
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Cuenta
                    <select
                      name="cuenta"
                      defaultValue=""
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-brand-black"
                    >
                      <option value="" disabled>Elegir cuenta</option>
                      {CUENTAS_ORDEN.map((cuenta) => (
                        <option key={cuenta} value={cuenta}>{cuenta}</option>
                      ))}
                    </select>
                  </label>
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
