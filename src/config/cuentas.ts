/**
 * Nombres exactos de la pestaña de cuentas en Google Sheets (columna A).
 * La pestaña puede llamarse "Cuentas " o "Cuentas" (ver `resolveCuentasSheetTitle`).
 */
export const CUENTAS_ORDEN = [
  "VALENCHO MERCADO PAGO 1",
  "VALENCHO MERCADO PAGO 2",
  "VALENCHO SANTANDER",
  "FRANCISCO MERCADO PAGO",
  "FRANCISCO SANTANDER",
  "EFECTIVO",
] as const;

export type CuentaNombreCanonico = (typeof CUENTAS_ORDEN)[number];

/** Espacios raros de Excel/Sheets y dobles espacios — para comparar con CUENTAS_ORDEN. */
export function normalizarNombreCuenta(n: string): string {
  return n
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

export function claveCuentaParaMatch(n: string): string {
  return normalizarNombreCuenta(n).toUpperCase();
}

export function ordenarCuentasCanonico<T extends { nombre: string }>(cuentas: T[]): T[] {
  const idx = (nombre: string) => {
    const key = claveCuentaParaMatch(nombre);
    const i = (CUENTAS_ORDEN as readonly string[]).findIndex(
      (c) => claveCuentaParaMatch(c) === key,
    );
    return i === -1 ? CUENTAS_ORDEN.length : i;
  };
  return [...cuentas].sort((a, b) => idx(a.nombre) - idx(b.nombre));
}
