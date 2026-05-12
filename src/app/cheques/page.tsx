import { getCheques } from "@/lib/googleSheets";
import { formatCurrency } from "@/lib/format";
import StatusBadge from "@/components/dashboard/StatusBadge";

export default async function ChequesPage() {
  const cheques = await getCheques();

  const urgentes = cheques.filter((c) => c.estado === "urgente");
  const estaSemana = cheques.filter((c) => c.estado === "esta_semana");
  const enTiempo = cheques.filter((c) => c.estado === "tiempo");
  const totalMonto = cheques.reduce((sum, c) => sum + c.monto, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-brand-black tracking-tight">
          Cheques
        </h1>
        <p className="mt-1 text-sm font-medium text-gray-400">
          Control de cheques emitidos
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-card">
          <div className="absolute top-0 left-0 h-1 w-full bg-red-400" />
          <p className="text-sm font-medium text-gray-500">Urgentes</p>
          <p className="mt-2 text-2xl font-bold text-brand-wine">{urgentes.length}</p>
          <p className="mt-1 text-xs text-gray-400">Vencen en menos de 5 días</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-card">
          <div className="absolute top-0 left-0 h-1 w-full bg-amber-400" />
          <p className="text-sm font-medium text-gray-500">Esta semana</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{estaSemana.length}</p>
          <p className="mt-1 text-xs text-gray-400">Vencen en menos de 10 días</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-card">
          <div className="absolute top-0 left-0 h-1 w-full bg-emerald-400" />
          <p className="text-sm font-medium text-gray-500">En tiempo</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{enTiempo.length}</p>
          <p className="mt-1 text-xs text-gray-400">Más de 10 días</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-cream-dark">
          <h3 className="font-bold text-brand-black">Todos los cheques</h3>
          <span className="text-sm font-bold text-brand-gold-dark">
            Total: {formatCurrency(totalMonto)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-brand-cream">
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Proveedor</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Monto</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Vencimiento</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cheques.map((c, i) => (
                <tr
                  key={c.id}
                  className={`transition-colors hover:bg-brand-cream ${
                    i !== cheques.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <td className="px-5 py-3.5 font-semibold text-brand-black">{c.proveedor}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-brand-black">{formatCurrency(c.monto)}</td>
                  <td className="px-5 py-3.5 text-gray-500">{c.fecha_vencimiento}</td>
                  <td className="px-5 py-3.5"><StatusBadge variant={c.estado} /></td>
                </tr>
              ))}
              {cheques.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                    No hay cheques registrados
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
