import Link from "next/link";
import { Download } from "lucide-react";
import {
  getCuentas,
  getCheques,
  getFacturasProveedores,
  getMovimientos,
} from "@/lib/googleSheets";
import { formatCurrency, getCurrentMonthLabel } from "@/lib/format";
import MetricCard from "@/components/dashboard/MetricCard";
import CuentasList from "@/components/dashboard/CuentasList";
import ChequesList from "@/components/dashboard/ChequesList";
import ProveedoresTable from "@/components/dashboard/ProveedoresTable";

function calcularResultadoMes(movimientos: Awaited<ReturnType<typeof getMovimientos>>) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return movimientos.reduce((acc, mov) => {
    if (!mov.fecha) return acc;
    const parts = mov.fecha.includes("/") ? mov.fecha.split("/") : null;
    const date = parts
      ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
      : new Date(mov.fecha);
    if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
      return acc + mov.monto;
    }
    return acc;
  }, 0);
}

export default async function DashboardPage() {
  const [cuentas, cheques, facturas, movimientos] = await Promise.all([
    getCuentas(),
    getCheques(),
    getFacturasProveedores(),
    getMovimientos(),
  ]);

  const totalDisponible = cuentas.reduce((sum, c) => sum + c.saldo, 0);
  const totalCheques = cheques.reduce((sum, c) => sum + c.monto, 0);
  const deudaProveedores = facturas.reduce((sum, f) => sum + f.monto, 0);
  const resultadoMes = calcularResultadoMes(movimientos);

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-black tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm font-medium text-gray-400">
            {getCurrentMonthLabel()}
          </p>
        </div>
        <Link
          href="/exportar"
          className="inline-flex items-center gap-2.5 rounded-xl bg-brand-black px-5 py-3 text-sm font-semibold text-brand-gold shadow-btn transition-all duration-200 hover:shadow-btn-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-btn-active"
        >
          <Download size={16} strokeWidth={2} />
          Exportar CSV para Fudo
        </Link>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total disponible"
          valor={formatCurrency(totalDisponible)}
          subtexto="Suma de todas las cuentas"
          color="neutral"
        />
        <MetricCard
          label="Cheques a pagar"
          valor={formatCurrency(totalCheques)}
          subtexto={`${cheques.length} cheque${cheques.length !== 1 ? "s" : ""} pendiente${cheques.length !== 1 ? "s" : ""}`}
          color="red"
        />
        <MetricCard
          label="Deuda proveedores"
          valor={formatCurrency(deudaProveedores)}
          subtexto={`${facturas.length} factura${facturas.length !== 1 ? "s" : ""}`}
          color="red"
        />
        <MetricCard
          label="Resultado del mes"
          valor={formatCurrency(resultadoMes)}
          subtexto={getCurrentMonthLabel()}
          color={resultadoMes >= 0 ? "green" : "red"}
        />
      </div>

      {/* TWO-COLUMN GRID */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CuentasList cuentas={cuentas} />
        <ChequesList cheques={cheques} />
      </div>

      {/* PROVEEDORES TABLE */}
      <ProveedoresTable facturas={facturas} />
    </div>
  );
}
