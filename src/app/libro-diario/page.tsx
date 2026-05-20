import { getIngresosDesglose, getMovimientos } from "@/lib/data";
import { formatCurrency } from "@/lib/format";
import {
  claveDia,
  parseDateKey,
  resumenPorDia,
  resumenPorMes,
  resumenPorSemana,
  totalesPorDia,
  type TotalesPeriodo,
} from "@/lib/libroDiarioResumen";
import type { IngresoDesglose, Movimiento } from "@/types";

export const dynamic = "force-dynamic";

type FilaLibroDiario = {
  id: string;
  fecha: string;
  categoria: string;
  detalle: string;
  ingreso: number;
  egreso: number;
  medioIngreso: string;
  medioEgreso: string;
};

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
    const formaIngreso = esIngreso ? (desg[0]?.forma ?? m.forma ?? "") : "";
    const formaEgreso = !esIngreso ? (m.forma ?? "") : "";
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

function TablaResumen({
  titulo,
  filas,
}: {
  titulo: string;
  filas: TotalesPeriodo[];
}) {
  if (filas.length === 0) return null;

  const totIng = filas.reduce((s, r) => s + r.totalIngreso, 0);
  const totEgr = filas.reduce((s, r) => s + r.totalEgreso, 0);

  return (
    <div className="rounded-2xl bg-white shadow-card overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3">
        <h2 className="text-base font-bold text-brand-black">{titulo}</h2>
      </div>
      <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2">Período</th>
                <th className="px-4 py-2 text-right">Ingresos</th>
                <th className="px-4 py-2 text-right">Egresos</th>
                <th className="px-4 py-2 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.key} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-brand-black">{r.label}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                    {formatCurrency(r.totalIngreso)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-brand-wine">
                    {formatCurrency(r.totalEgreso)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-semibold ${
                      r.resultado >= 0 ? "text-emerald-700" : "text-brand-wine"
                    }`}
                  >
                    {formatCurrency(r.resultado)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-brand-cream/60 font-bold">
                <td className="px-4 py-2.5 text-brand-black">Total</td>
                <td className="px-4 py-2.5 text-right text-emerald-700">
                  {formatCurrency(totIng)}
                </td>
                <td className="px-4 py-2.5 text-right text-brand-wine">
                  {formatCurrency(totEgr)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right ${
                    totIng - totEgr >= 0 ? "text-emerald-700" : "text-brand-wine"
                  }`}
                >
                  {formatCurrency(totIng - totEgr)}
                </td>
              </tr>
            </tfoot>
          </table>
      </div>
    </div>
  );
}

export default async function LibroDiarioPage() {
  const [movimientos, desgloses] = await Promise.all([
    getMovimientos(),
    getIngresosDesglose(),
  ]);

  const filas = armarFilas(movimientos, desgloses);
  filas.sort((a, b) => {
    const ka = parseDateKey(a.fecha) ?? a.fecha;
    const kb = parseDateKey(b.fecha) ?? b.fecha;
    return ka.localeCompare(kb);
  });

  const totalesDia = totalesPorDia(filas);
  const ultimaPorDia = new Map<string, string>();
  for (const f of filas) {
    ultimaPorDia.set(claveDia(f.fecha), f.id);
  }
  const porDia = resumenPorDia(filas);
  const porSemana = resumenPorSemana(filas);
  const porMes = resumenPorMes(filas);

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
          <p
            className={`mt-1 text-2xl font-bold ${
              totalIngresosGlobal - totalEgresosGlobal >= 0
                ? "text-emerald-700"
                : "text-brand-wine"
            }`}
          >
            {formatCurrency(totalIngresosGlobal - totalEgresosGlobal)}
          </p>
        </div>
      </div>

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
                const keyDia = claveDia(f.fecha);
                const tot = totalesDia.get(keyDia);
                const esUltimaDelDia = ultimaPorDia.get(keyDia) === f.id;
                return (
                  <tr
                    key={f.id}
                    className={`transition-colors hover:bg-brand-cream ${
                      i !== filas.length - 1 ? "border-b border-gray-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-brand-black whitespace-nowrap">
                      {f.fecha}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{f.categoria}</td>
                    <td
                      className="px-4 py-3 text-gray-700 max-w-[280px] truncate"
                      title={f.detalle}
                    >
                      {f.detalle}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                      {f.ingreso > 0 ? formatCurrency(f.ingreso) : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-wine whitespace-nowrap">
                      {f.egreso > 0 ? formatCurrency(f.egreso) : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{f.medioIngreso || ""}</td>
                    <td className="px-4 py-3 text-gray-600">{f.medioEgreso || ""}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                      {esUltimaDelDia && tot && tot.totalIngreso > 0
                        ? formatCurrency(tot.totalIngreso)
                        : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-brand-wine whitespace-nowrap">
                      {esUltimaDelDia && tot && tot.totalEgreso > 0
                        ? formatCurrency(tot.totalEgreso)
                        : ""}
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
        <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">
          En la última fila de cada fecha: total del día (suma de todos los ingresos o egresos de ese día, todos los movimientos).
        </p>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-bold text-brand-black">Resúmenes</h2>
        <TablaResumen titulo="Por día" filas={porDia} />
        <TablaResumen titulo="Por semana" filas={porSemana} />
        <TablaResumen titulo="Por mes" filas={porMes} />
      </div>
    </div>
  );
}
