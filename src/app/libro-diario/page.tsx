import { getMovimientos } from "@/lib/googleSheets";
import { formatCurrency } from "@/lib/format";

export default async function LibroDiarioPage() {
  const movimientos = await getMovimientos();

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

      <div className="rounded-2xl bg-white shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-brand-cream border-b border-brand-cream-dark">
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Fecha</th>
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
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
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
