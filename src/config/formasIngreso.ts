export const FORMAS_INGRESO_POR_CUENTA = [
  {
    cuenta: "SANTANDER VALENCHO",
    label: "Santander Valencho",
    formas: ["QR", "CREDITO", "DEBITO"],
  },
  {
    cuenta: "SANTANDER FRANCISCO",
    label: "Santander Francisco",
    formas: ["QR", "CREDITO", "DEBITO"],
  },
  {
    cuenta: "VALENCHO MERCADO PAGO",
    label: "Valencho Mercado Pago",
    formas: ["ALIAS"],
  },
  {
    cuenta: "FRANCISCO MERCADO PAGO",
    label: "Francisco Mercado Pago",
    formas: ["ALIAS"],
  },
  {
    cuenta: "EFECTIVO",
    label: "Efectivo",
    formas: ["EFECTIVO"],
  },
] as const;

export const FORMAS_INGRESO = ["QR", "CREDITO", "DEBITO", "ALIAS", "EFECTIVO"] as const;

/**
 * Formas de EGRESO (cuando sale plata para pagar algo).
 * Distintas de las de ingreso: aquí entran TRANSFERENCIA y CHEQUE.
 */
export const FORMAS_EGRESO_POR_CUENTA = [
  {
    cuenta: "SANTANDER VALENCHO",
    label: "Santander Valencho",
    formas: ["TRANSFERENCIA", "CREDITO", "DEBITO", "CHEQUE"],
  },
  {
    cuenta: "SANTANDER FRANCISCO",
    label: "Santander Francisco",
    formas: ["TRANSFERENCIA", "CREDITO", "DEBITO", "CHEQUE"],
  },
  {
    cuenta: "VALENCHO MERCADO PAGO",
    label: "Valencho Mercado Pago",
    formas: ["TRANSFERENCIA", "DEBITO"],
  },
  {
    cuenta: "FRANCISCO MERCADO PAGO",
    label: "Francisco Mercado Pago",
    formas: ["TRANSFERENCIA", "DEBITO"],
  },
  {
    cuenta: "EFECTIVO",
    label: "Efectivo",
    formas: ["EFECTIVO"],
  },
] as const;

export const FORMAS_EGRESO = ["TRANSFERENCIA", "CREDITO", "DEBITO", "CHEQUE", "EFECTIVO"] as const;
