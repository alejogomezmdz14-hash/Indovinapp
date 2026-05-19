import { Building2, Banknote, Wallet, FileText, Landmark } from "lucide-react";
import type { Cuenta } from "@/types";
import { formatCurrency } from "@/lib/format";
import type { LucideIcon } from "lucide-react";
import { CUENTAS_ORDEN, claveCuentaParaMatch } from "@/config/cuentas";

function getAccountIcon(nombre: string): LucideIcon {
  const lower = nombre.toLowerCase();
  if (lower.includes("mercado") || lower.includes("mp")) return Wallet;
  if (lower.includes("santander")) return Landmark;
  if (lower.includes("efectivo") || lower.includes("caja")) return Banknote;
  if (lower.includes("cheque")) return FileText;
  return Building2;
}

interface CuentasListProps {
  cuentas: Cuenta[];
}

export default function CuentasList({ cuentas }: CuentasListProps) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-card">
      <h3 className="text-base font-bold text-brand-black">
        Dónde está la plata
      </h3>
      {(() => {
        const clavesEnHoja = new Set(cuentas.map((c) => claveCuentaParaMatch(c.nombre)));
        const faltan = CUENTAS_ORDEN.filter((n) => !clavesEnHoja.has(claveCuentaParaMatch(n)));
        if (faltan.length === 0) return null;
        return (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
            En la tabla <code>cuentas</code> faltan o no coinciden exactamente:{" "}
            <span className="font-semibold">{faltan.join(" · ")}</span>
          </p>
        );
      })()}
      <ul className="mt-5 space-y-3">
        {cuentas.map((cuenta) => {
          const Icon = getAccountIcon(cuenta.nombre);
          return (
            <li
              key={cuenta.nombre}
              className="flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-brand-cream"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cream-dark">
                  <Icon size={18} className="text-brand-gold-dark" strokeWidth={1.8} />
                </div>
                <span className="text-sm font-medium text-gray-700">{cuenta.nombre}</span>
              </div>
              <span className="text-sm font-bold text-brand-black">
                {formatCurrency(cuenta.saldo)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
