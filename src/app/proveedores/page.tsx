import { getFacturasProveedores } from "@/lib/googleSheets";
import { formatCurrency } from "@/lib/format";
import StatusBadge from "@/components/dashboard/StatusBadge";

export default async function ProveedoresPage() {
  const facturas = await getFacturasProveedores();

  const vencidas = facturas.filter((f) => f.estado === "vencida");
  const porVencer = facturas.filter((f) => f.estado === "por_vencer");
  const alDia = facturas.filter((f) => f.estado === "al_dia");
  const totalDeuda = facturas.reduce((sum, f) => sum + f.monto, 0);

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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-card">
          <div className="absolute top-0 left-0 h-1 w-full bg-red-400" />
          <p className="text-sm font-medium text-gray-500">Vencidas</p>
          <p className="mt-2 text-2xl font-bold text-brand-wine">{vencidas.length}</p>
          <p className="mt-1 text-xs text-gray-400">
            {formatCurrency(vencidas.reduce((s, f) => s + f.monto, 0))}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-card">
          <div className="absolute top-0 left-0 h-1 w-full bg-amber-400" />
          <p className="text-sm font-medium text-gray-500">Por vencer</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{porVencer.length}</p>
          <p className="mt-1 text-xs text-gray-400">
            {formatCurrency(porVencer.reduce((s, f) => s + f.monto, 0))}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-card">
          <div className="absolute top-0 left-0 h-1 w-full bg-emerald-400" />
          <p className="text-sm font-medium text-gray-500">Al día</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{alDia.length}</p>
          <p className="mt-1 text-xs text-gray-400">
            {formatCurrency(alDia.reduce((s, f) => s + f.monto, 0))}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-cream-dark">
          <h3 className="font-bold text-brand-black">Todas las facturas</h3>
          <span className="text-sm font-bold text-brand-wine">
            Deuda total: {formatCurrency(totalDeuda)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-brand-cream">
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Proveedor</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Importe</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Vencimiento</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f, i) => (
                <tr
                  key={f.id}
                  className={`transition-colors hover:bg-brand-cream ${
                    i !== facturas.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <td className="px-5 py-3.5 font-semibold text-brand-black">{f.proveedor}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-brand-black">{formatCurrency(f.monto)}</td>
                  <td className="px-5 py-3.5 text-gray-500">{f.fecha_vencimiento}</td>
                  <td className="py-3.5 px-5"><StatusBadge variant={f.estado} /></td>
                </tr>
              ))}
              {facturas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                    No hay facturas registradas
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
