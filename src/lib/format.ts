export function formatCurrency(value: number): string {
  const abs = Math.abs(Math.round(value));
  const formatted = abs.toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function getCurrentMonthLabel(): string {
  const now = new Date();
  return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
}
