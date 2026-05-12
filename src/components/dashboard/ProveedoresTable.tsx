import type { FacturaProveedor } from "@/types";
import { formatCurrency } from "@/lib/format";
import StatusBadge from "./StatusBadge";

interface ProveedoresTableProps {
  facturas: FacturaProveedor[];
}

export default function ProveedoresTable({ facturas }: ProveedoresTableProps) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-card">
      <h3 className="text-base font-bold text-brand-black">Proveedores</h3>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brand-cream-dark text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="pb-3 pr-4">Proveedor</th>
              <th className="pb-3 pr-4 text-right">Importe</th>
              <th className="pb-3 pr-4">Vencimiento</th>
              <th className="pb-3">Estado</th>
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
                <td className="py-3.5 pr-4 font-semibold text-brand-black">
                  {f.proveedor}
                </td>
                <td className="py-3.5 pr-4 text-right font-medium text-gray-700">
                  {formatCurrency(f.monto)}
                </td>
                <td className="py-3.5 pr-4 text-gray-500">
                  {f.fecha_vencimiento}
                </td>
                <td className="py-3.5">
                  <StatusBadge variant={f.estado} />
                </td>
              </tr>
            ))}
            {facturas.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-400">
                  No hay facturas registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
