-- Indovina: agregar forma a movimientos (QR/CREDITO/DEBITO/ALIAS/EFECTIVO).
-- Aplica tanto a gastos como a ingresos. Para ingresos también existe la fila
-- en ingresos_desglose; este campo en movimientos es el "medio" plano.

alter table public.movimientos
  add column if not exists forma text not null default '';

create index if not exists movimientos_forma_idx on public.movimientos (forma);
create index if not exists movimientos_cuenta_forma_idx on public.movimientos (cuenta, forma);
