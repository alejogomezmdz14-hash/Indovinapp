import type { Cheque } from "@/types";
import { formatCurrency } from "@/lib/format";
import StatusBadge from "./StatusBadge";

interface ChequesListProps {
  cheques: Cheque[];
}

export default function ChequesList({ cheques }: ChequesListProps) {
  const sorted = [...cheques].sort(
    (a, b) =>
      new Date(a.fecha_vencimiento).getTime() -
      new Date(b.fecha_vencimiento).getTime()
  );

  return (
    <div className="rounded-2xl bg-white p-6 shadow-card">
      <h3 className="text-base font-bold text-brand-black">
        Cheques a pagar
      </h3>
      <ul className="mt-5 space-y-2">
        {sorted.map((cheque) => (
          <li
            key={cheque.id}
            className="flex items-center justify-between gap-3 rounded-xl p-3 transition-colors hover:bg-brand-cream"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-brand-black">
                {cheque.proveedor}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Vence: {cheque.fecha_vencimiento}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold text-brand-black">
              {formatCurrency(cheque.monto)}
            </span>
            <StatusBadge variant={cheque.estado} />
          </li>
        ))}
        {sorted.length === 0 && (
          <li className="py-6 text-center text-sm text-gray-400">
            No hay cheques registrados
          </li>
        )}
      </ul>
    </div>
  );
}
