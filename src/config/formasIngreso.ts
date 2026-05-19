export const FORMAS_INGRESO_POR_CUENTA = [
  {
    cuenta: "VALENCHO SANTANDER",
    label: "Santander Valencho",
    formas: ["QR", "CREDITO", "DEBITO"],
  },
  {
    cuenta: "FRANCISCO SANTANDER",
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
