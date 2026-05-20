/** Fila mínima para armar totales del libro diario */
export type FilaMonto = {
  fecha: string;
  ingreso: number;
  egreso: number;
};

export type TotalesPeriodo = {
  key: string;
  label: string;
  totalIngreso: number;
  totalEgreso: number;
  resultado: number;
};

/** Normaliza fecha DD/MM/YYYY o YYYY-MM-DD a clave ordenable YYYY-MM-DD */
export function parseDateKey(raw: string): string {
  if (!raw) return "";
  if (raw.includes("/")) {
    const [d, m, y] = raw.split("/");
    return `${y || "?"}-${(m || "?").padStart(2, "0")}-${(d || "?").padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

function parseDateObj(dateKey: string): Date | null {
  if (!dateKey || dateKey.includes("?")) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

const MONTH_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** Lunes de la semana que contiene la fecha (calendario local) */
function weekStartMonday(dateKey: string): string {
  const d = parseDateObj(dateKey);
  if (!d) return dateKey;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatDayLabel(dateKey: string, fallbackFecha: string): string {
  const d = parseDateObj(dateKey);
  if (!d) return fallbackFecha || dateKey;
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function formatWeekLabel(weekStartKey: string): string {
  const start = parseDateObj(weekStartKey);
  if (!start) return weekStartKey;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (dt: Date) =>
    `${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}${dt.getFullYear() !== start.getFullYear() ? ` ${dt.getFullYear()}` : ""}`;
  return `Semana ${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`;
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  const names = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return `${names[m - 1]} ${y}`;
}

function acumular(
  map: Map<string, TotalesPeriodo>,
  key: string,
  label: string,
  ingreso: number,
  egreso: number,
) {
  const prev = map.get(key) ?? {
    key,
    label,
    totalIngreso: 0,
    totalEgreso: 0,
    resultado: 0,
  };
  prev.totalIngreso += ingreso;
  prev.totalEgreso += egreso;
  prev.resultado = prev.totalIngreso - prev.totalEgreso;
  map.set(key, prev);
}

/** Totales finales por día (clave YYYY-MM-DD) */
export function totalesPorDia(filas: FilaMonto[]) {
  const totales = new Map<string, { totalIngreso: number; totalEgreso: number }>();
  for (const f of filas) {
    const key = parseDateKey(f.fecha);
    const prev = totales.get(key) ?? { totalIngreso: 0, totalEgreso: 0 };
    prev.totalIngreso += f.ingreso;
    prev.totalEgreso += f.egreso;
    totales.set(key, prev);
  }
  return totales;
}

/** Acumulado del día fila a fila (ingresos y egresos que van sumando en el día) */
export function acumuladosPorFila(filas: FilaMonto[]) {
  const out: { totalDiaIngreso: number; totalDiaEgreso: number }[] = [];
  let dateKey = "";
  let runIng = 0;
  let runEgr = 0;

  for (const f of filas) {
    const k = parseDateKey(f.fecha);
    if (k !== dateKey) {
      dateKey = k;
      runIng = 0;
      runEgr = 0;
    }
    runIng += f.ingreso;
    runEgr += f.egreso;
    out.push({ totalDiaIngreso: runIng, totalDiaEgreso: runEgr });
  }
  return out;
}

export function resumenPorDia(filas: FilaMonto[]): TotalesPeriodo[] {
  const map = new Map<string, TotalesPeriodo>();
  for (const f of filas) {
    const key = parseDateKey(f.fecha);
    acumular(map, key, formatDayLabel(key, f.fecha), f.ingreso, f.egreso);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function resumenPorSemana(filas: FilaMonto[]): TotalesPeriodo[] {
  const map = new Map<string, TotalesPeriodo>();
  for (const f of filas) {
    const dayKey = parseDateKey(f.fecha);
    const key = weekStartMonday(dayKey);
    acumular(map, key, formatWeekLabel(key), f.ingreso, f.egreso);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function resumenPorMes(filas: FilaMonto[]): TotalesPeriodo[] {
  const map = new Map<string, TotalesPeriodo>();
  for (const f of filas) {
    const dayKey = parseDateKey(f.fecha);
    const key = dayKey.slice(0, 7);
    acumular(map, key, formatMonthLabel(key), f.ingreso, f.egreso);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}
