-- Indovina: agregar forma de pago (QR/CREDITO/DEBITO/ALIAS/EFECTIVO) a pagos_proveedor.
-- Un pago = una cuenta + una forma. Si en el futuro hace falta desglosar un pago en
-- varios medios, agregamos tabla pagos_desglose espejando ingresos_desglose.

alter table public.pagos_proveedor
  add column if not exists forma text not null default '';

create index if not exists pagos_proveedor_forma_idx on public.pagos_proveedor (forma);
create index if not exists pagos_proveedor_cuenta_forma_idx on public.pagos_proveedor (cuenta, forma);
