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

/**
 * Normaliza DD/MM/YYYY o DD/MM/YY (año 2 dígitos → 20xx) a YYYY-MM-DD.
 * Devuelve null si la fecha no se puede interpretar (no inventar claves).
 */
export function parseDateKey(raw: string): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const key = s.slice(0, 10);
    return isValidYmd(key) ? key : null;
  }

  if (!s.includes("/")) return null;

  const parts = s.split("/").map((p) => p.trim());
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;

  if (parts[2].length <= 2) {
    year = year >= 50 ? 1900 + year : 2000 + year;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null;
  }

  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidYmd(key) ? key : null;
}

function isValidYmd(key: string): boolean {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function parseDateObj(dateKey: string): Date | null {
  if (!isValidYmd(dateKey)) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Clave de agrupación: fecha normalizada o texto original si no parsea */
export function claveDia(fecha: string): string {
  return parseDateKey(fecha) ?? fecha.trim();
}

/** Lunes de la semana (solo si la fecha parsea bien) */
function weekStartMonday(dateKey: string): string | null {
  const d = parseDateObj(dateKey);
  if (!d) return null;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatWeekLabel(weekStartKey: string): string {
  const start = parseDateObj(weekStartKey);
  if (!start) return weekStartKey;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (dt: Date) =>
    `${dt.getDate()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  return `${fmt(start)} – ${fmt(end)}`;
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

/**
 * Suma de TODOS los ingresos y egresos del día (todos los movimientos, todos los proveedores).
 * Clave = claveDia(fecha).
 */
export function totalesPorDia(filas: FilaMonto[]) {
  const totales = new Map<string, { totalIngreso: number; totalEgreso: number }>();
  for (const f of filas) {
    const key = claveDia(f.fecha);
    if (!key) continue;
    const prev = totales.get(key) ?? { totalIngreso: 0, totalEgreso: 0 };
    prev.totalIngreso += f.ingreso;
    prev.totalEgreso += f.egreso;
    totales.set(key, prev);
  }
  return totales;
}

/** Etiqueta de día: la fecha tal como está en el movimiento (como el Sheet) */
function labelDia(fecha: string): string {
  return fecha.trim();
}

export function resumenPorDia(filas: FilaMonto[]): TotalesPeriodo[] {
  const map = new Map<string, TotalesPeriodo>();
  for (const f of filas) {
    const key = claveDia(f.fecha);
    if (!key) continue;
    acumular(map, key, labelDia(f.fecha), f.ingreso, f.egreso);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function resumenPorSemana(filas: FilaMonto[]): TotalesPeriodo[] {
  const map = new Map<string, TotalesPeriodo>();
  for (const f of filas) {
    const dayKey = parseDateKey(f.fecha);
    if (!dayKey) continue;
    const weekKey = weekStartMonday(dayKey);
    if (!weekKey) continue;
    acumular(map, weekKey, formatWeekLabel(weekKey), f.ingreso, f.egreso);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function resumenPorMes(filas: FilaMonto[]): TotalesPeriodo[] {
  const map = new Map<string, TotalesPeriodo>();
  for (const f of filas) {
    const dayKey = parseDateKey(f.fecha);
    if (!dayKey) continue;
    const monthKey = dayKey.slice(0, 7);
    acumular(map, monthKey, formatMonthLabel(monthKey), f.ingreso, f.egreso);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}
