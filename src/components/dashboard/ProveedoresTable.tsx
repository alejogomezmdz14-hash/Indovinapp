import Link from "next/link";
import type { ResumenProveedor } from "@/types";
import { formatCurrency } from "@/lib/format";
import StatusBadge from "./StatusBadge";

interface ProveedoresTableProps {
  proveedores: ResumenProveedor[];
}

export default function ProveedoresTable({ proveedores }: ProveedoresTableProps) {
  const totalDeuda = proveedores.reduce((sum, p) => sum + p.saldo_pendiente, 0);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-brand-black">Proveedores</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Deuda total: <span className="font-bold text-brand-wine">{formatCurrency(totalDeuda)}</span>
          </p>
        </div>
        <Link
          href="/proveedores"
          className="text-xs font-semibold text-brand-gold-dark hover:text-brand-black transition"
        >
          Asignar pagos →
        </Link>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brand-cream-dark text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="pb-3 pr-4">Proveedor</th>
              <th className="pb-3 pr-4 text-right">Facturado</th>
              <th className="pb-3 pr-4 text-right">Pagado factura</th>
              <th className="pb-3 pr-4 text-right" title="Gastos directos cargados al proveedor desde el bot (sin factura)">Gasto directo</th>
              <th className="pb-3 pr-4 text-right" title="Total de plata enviada al proveedor: pagos imputados + gastos directos">Total movido</th>
              <th className="pb-3 pr-4 text-right">Saldo pendiente</th>
              <th className="pb-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p, i) => (
              <tr
                key={p.proveedor}
                className={`transition-colors hover:bg-brand-cream ${
                  i !== proveedores.length - 1 ? "border-b border-gray-50" : ""
                }`}
              >
                <td className="py-3.5 pr-4 font-semibold text-brand-black">
                  {p.proveedor}
                </td>
                <td className="py-3.5 pr-4 text-right font-medium text-gray-700">
                  {formatCurrency(p.total_facturado)}
                </td>
                <td className="py-3.5 pr-4 text-right font-medium text-emerald-700">
                  {formatCurrency(p.total_pagado)}
                </td>
                <td className="py-3.5 pr-4 text-right font-medium text-gray-600">
                  {p.gastos_directos > 0 ? formatCurrency(p.gastos_directos) : "-"}
                </td>
                <td className="py-3.5 pr-4 text-right font-bold text-brand-black">
                  {formatCurrency(p.total_movido)}
                </td>
                <td className="py-3.5 pr-4 text-right font-bold text-brand-wine">
                  {formatCurrency(p.saldo_pendiente)}
                </td>
                <td className="py-3.5">
                  <StatusBadge variant={p.estado} />
                </td>
              </tr>
            ))}
            {proveedores.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-400">
                  No hay proveedores registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
