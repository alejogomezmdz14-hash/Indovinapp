"use client";

import { useState } from "react";
import { FORMAS_INGRESO_POR_CUENTA } from "@/config/formasIngreso";

/** Select sincronizado cuenta → forma. La forma cambia al cambiar la cuenta. */
export default function CuentaFormaSelect({ defaultCuenta = "" }: { defaultCuenta?: string }) {
  const [cuenta, setCuenta] = useState<string>(defaultCuenta);
  const config = FORMAS_INGRESO_POR_CUENTA.find((c) => c.cuenta === cuenta);
  const formasDisponibles = config?.formas ?? [];

  return (
    <>
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Cuenta
        <select
          name="cuenta"
          required
          value={cuenta}
          onChange={(e) => setCuenta(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-brand-black"
        >
          <option value="" disabled>Elegir cuenta</option>
          {FORMAS_INGRESO_POR_CUENTA.map((c) => (
            <option key={c.cuenta} value={c.cuenta}>{c.cuenta}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Forma
        <select
          name="forma"
          required
          disabled={!cuenta}
          defaultValue=""
          key={cuenta /* fuerza re-render para que el default vuelva a "" al cambiar cuenta */}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-brand-black disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="" disabled>{cuenta ? "Elegir forma" : "Elegí cuenta primero"}</option>
          {formasDisponibles.map((forma) => (
            <option key={forma} value={forma}>{forma}</option>
          ))}
        </select>
      </label>
    </>
  );
}
