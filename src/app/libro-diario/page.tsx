import { getIngresosDesglose, getMovimientos } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import type { IngresoDesglose, Movimiento } from "@/types";

export const dynamic = "force-dynamic";

type FilaLibroDiario = {
  id: string;
  fecha: string;
  categoria: string;
  detalle: string;
  ingreso: number; // 0 si es egreso
  egreso: number;  // 0 si es ingreso
  medioIngreso: string;
  medioEgreso: string;
};

function parseDateKey(raw: string): string {
  if (!raw) return "";
  if (raw.includes("/")) {
    const [d, m, y] = raw.split("/");
    return `${y || "?"}-${(m || "?").padStart(2, "0")}-${(d || "?").padStart(2, "0")}`;
  }
  return raw;
}

/**
 * Convierte los movimientos de Supabase a las 7 columnas con valores +
 * 2 columnas de totales del día (ingresos / egresos).
 * El layout coincide exactamente con la pestaña "Libro diario" del Sheet.
 */
function armarFilas(
  movimientos: Movimiento[],
  desgloses: IngresoDesglose[],
): FilaLibroDiario[] {
  const desglosePorMov = new Map<string, IngresoDesglose[]>();
  for (const d of desgloses) {
    const key = String(d.movimiento_id ?? "");
    if (!desglosePorMov.has(key)) desglosePorMov.set(key, []);
    desglosePorMov.get(key)!.push(d);
  }

  return movimientos.map((m) => {
    const esIngreso = m.monto >= 0;
    const desg = desglosePorMov.get(m.id) ?? [];
    const formaIngreso = esIngreso
      ? (desg[0]?.forma ?? m.forma ?? "")
      : "";
    const formaEgreso = !esIngreso
      ? (m.forma ?? "")
      : "";
    const detalle = m.proveedor
      ? (m.comentario ? `${m.proveedor} - ${m.comentario}` : m.proveedor)
      : m.comentario;

    return {
      id: m.id,
      fecha: m.fecha,
      categoria: m.categoria || (esIngreso ? "Ingreso" : "Gasto"),
      detalle,
      ingreso: esIngreso ? m.monto : 0,
      egreso: esIngreso ? 0 : Math.abs(m.monto),
      medioIngreso: formaIngreso,
      medioEgreso: formaEgreso,
    };
  });
}

function totalesPorDia(filas: FilaLibroDiario[]) {
  const totales = new Map<string, { totalIngreso: number; totalEgreso: number }>();
  for (const f of filas) {
    const key = parseDateKey(f.fecha);
    const prev = totales.get(key) ?? { totalIngreso: 0, totalEgreso: 0 };
    prev.totalIngreso += f.ingreso;
    prev.totalEgreso += f.egreso;
    totales.set(key, prev);
  }
  return totales;
}

export default async function LibroDiarioPage() {
  const [movimientos, desgloses] = await Promise.all([
    getMovimientos(),
    getIngresosDesglose(),
  ]);

  const filas = armarFilas(movimientos, desgloses);
  // Orden cronológico ascendente (igual que el Sheet): primero la fecha más vieja arriba.
  filas.sort((a, b) => {
    const ka = parseDateKey(a.fecha);
    const kb = parseDateKey(b.fecha);
    return ka.localeCompare(kb);
  });

  const totales = totalesPorDia(filas);
  // Marcamos la última fila de cada día para mostrar el total ahí.
  const ultimaPorDia = new Map<string, string>();
  for (const f of filas) {
    ultimaPorDia.set(parseDateKey(f.fecha), f.id);
  }

  const totalIngresosGlobal = filas.reduce((s, f) => s + f.ingreso, 0);
  const totalEgresosGlobal = filas.reduce((s, f) => s + f.egreso, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-brand-black tracking-tight">
          Libro diario
        </h1>
        <p className="mt-1 text-sm font-medium text-gray-400">
          Espejo de la pestaña “Libro diario” del Sheet
        </p>
      </div>

      {/* Métricas globales */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-card">
          <p className="text-sm font-medium text-gray-500">Total ingresos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            {formatCurrency(totalIngresosGlobal)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-card">
          <p className="text-sm font-medium text-gray-500">Total egresos</p>
          <p className="mt-1 text-2xl font-bold text-brand-wine">
            {formatCurrency(totalEgresosGlobal)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-card">
          <p className="text-sm font-medium text-gray-500">Resultado</p>
          <p className={`mt-1 text-2xl font-bold ${totalIngresosGlobal - totalEgresosGlobal >= 0 ? "text-emerald-700" : "text-brand-wine"}`}>
            {formatCurrency(totalIngresosGlobal - totalEgresosGlobal)}
          </p>
        </div>
      </div>

      {/* Tabla idéntica al Sheet — 9 columnas */}
      <div className="rounded-2xl bg-white shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-brand-cream border-b border-brand-cream-dark text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">categoria</th>
                <th className="px-4 py-3">Detalle de los movimientos</th>
                <th className="px-4 py-3 text-right">ingresos</th>
                <th className="px-4 py-3 text-right">egresos</th>
                <th className="px-4 py-3">medio de ingreso</th>
                <th className="px-4 py-3">medio de egreso</th>
                <th className="px-4 py-3 text-right">total del dia ingreso</th>
                <th className="px-4 py-3 text-right">total del dia egresos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const dateKey = parseDateKey(f.fecha);
                const esUltimaDelDia = ultimaPorDia.get(dateKey) === f.id;
                const tot = totales.get(dateKey);
                return (
                  <tr
                    key={f.id}
                    className={`transition-colors hover:bg-brand-cream ${i !== filas.length - 1 ? "border-b border-gray-50" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-brand-black whitespace-nowrap">{f.fecha}</td>
                    <td className="px-4 py-3 text-gray-600">{f.categoria}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[280px] truncate" title={f.detalle}>{f.detalle}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                      {f.ingreso > 0 ? formatCurrency(f.ingreso) : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-wine whitespace-nowrap">
                      {f.egreso > 0 ? formatCurrency(f.egreso) : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{f.medioIngreso || ""}</td>
                    <td className="px-4 py-3 text-gray-600">{f.medioEgreso || ""}</td>
                    <td className="px-4 py-3 text-right text-emerald-700 whitespace-nowrap">
                      {esUltimaDelDia && tot && tot.totalIngreso > 0 ? formatCurrency(tot.totalIngreso) : ""}
                    </td>
                    <td className="px-4 py-3 text-right text-brand-wine whitespace-nowrap">
                      {esUltimaDelDia && tot && tot.totalEgreso > 0 ? formatCurrency(tot.totalEgreso) : ""}
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-gray-400">
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
