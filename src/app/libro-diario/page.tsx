import { getIngresosDesglose, getMovimientos } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import type { ResumenIngreso } from "@/types";
import resumenes from "@/lib/resumenesFinancieros";

export const dynamic = "force-dynamic";

const { buildResumenIngresos } = resumenes as {
  buildResumenIngresos: (
    movimientos: Awaited<ReturnType<typeof getMovimientos>>,
    desgloses: Awaited<ReturnType<typeof getIngresosDesglose>>,
  ) => ResumenIngreso[];
};

export default async function LibroDiarioPage() {
  const [movimientos, desgloses] = await Promise.all([
    getMovimientos(),
    getIngresosDesglose(),
  ]);
  const resumenIngresos = buildResumenIngresos(movimientos, desgloses);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-brand-black tracking-tight">
          Libro diario
        </h1>
        <p className="mt-1 text-sm font-medium text-gray-400">
          Todos los movimientos registrados
        </p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-card">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-bold text-brand-black">Ingresos por cuenta</h3>
            <p className="text-sm text-gray-400">
              Resumen desplegable con QR, crédito, débito, alias y efectivo.
            </p>
          </div>
          <span className="text-sm font-bold text-emerald-700">
            {formatCurrency(resumenIngresos.reduce((sum, i) => sum + i.monto_total, 0))}
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {resumenIngresos.map((ingreso) => (
            <details
              key={`${ingreso.fecha}-${ingreso.fecha_carga}-${ingreso.cuenta}`}
              className="group rounded-xl border border-brand-cream-dark bg-brand-cream/40 p-4"
            >
              <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-brand-black">{ingreso.cuenta}</p>
                  <p className="text-xs text-gray-500">
                    Fecha: {ingreso.fecha || "-"} - Carga: {ingreso.fecha_carga || "-"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-emerald-700">
                    {formatCurrency(ingreso.monto_total)}
                  </span>
                  <span className="text-xs font-semibold text-gray-400 group-open:hidden">
                    Ver desglose
                  </span>
                  <span className="hidden text-xs font-semibold text-gray-400 group-open:inline">
                    Ocultar
                  </span>
                </div>
              </summary>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {ingreso.desglose.length > 0 ? (
                  ingreso.desglose.map((item) => (
                    <div key={item.forma} className="rounded-lg bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {item.forma}
                      </p>
                      <p className="font-bold text-brand-black">{formatCurrency(item.monto)}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">
                    Sin desglose cargado todavía para estos ingresos.
                  </p>
                )}
              </div>
            </details>
          ))}
          {resumenIngresos.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">
              No hay ingresos registrados para resumir.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-brand-cream border-b border-brand-cream-dark">
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Fecha</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Carga</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Cuenta</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Monto</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Proveedor</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Categoría</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Comentario</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Comprobante</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">N° Comp.</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Vencimiento</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((mov, i) => (
                <tr
                  key={mov.id}
                  className={`transition-colors hover:bg-brand-cream ${
                    i !== movimientos.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <td className="px-5 py-3.5 font-medium text-brand-black whitespace-nowrap">{mov.fecha}</td>
                  <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{mov.fecha_carga || "-"}</td>
                  <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{mov.cuenta || "-"}</td>
                  <td className={`px-5 py-3.5 text-right font-bold whitespace-nowrap ${mov.monto >= 0 ? "text-emerald-600" : "text-brand-wine"}`}>
                    {formatCurrency(mov.monto)}
                  </td>
                  <td className="px-5 py-3.5 text-gray-700">{mov.proveedor}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex rounded-lg bg-brand-cream-dark px-2.5 py-1 text-xs font-medium text-brand-black">
                      {mov.categoria}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 max-w-[200px] truncate">{mov.comentario}</td>
                  <td className="px-5 py-3.5 text-gray-500">{mov.tipo_comprobante}</td>
                  <td className="px-5 py-3.5 text-gray-500">{mov.numero_comprobante}</td>
                  <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{mov.fecha_vencimiento}</td>
                </tr>
              ))}
              {movimientos.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-gray-400">
                    No hay movimientos registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
