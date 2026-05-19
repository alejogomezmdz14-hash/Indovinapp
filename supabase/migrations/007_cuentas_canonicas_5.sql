-- Indovina: 6 cuentas → 5 cuentas canónicas.
-- Decisión de negocio (cliente, 2026-05-19): unificar MP 1 y MP 2 en una sola
-- "VALENCHO MERCADO PAGO" y normalizar Santander a "SANTANDER VALENCHO/FRANCISCO".
--
-- Cuentas finales (orden canónico):
--   SANTANDER VALENCHO       (formas: QR, CREDITO, DEBITO)
--   SANTANDER FRANCISCO      (formas: QR, CREDITO, DEBITO)
--   VALENCHO MERCADO PAGO    (formas: ALIAS)
--   FRANCISCO MERCADO PAGO   (formas: ALIAS)
--   EFECTIVO                 (formas: EFECTIVO)
--
-- Idempotente: reaplicable. Suma saldos al consolidar.

-- 1) Crear (o asegurar) las 5 cuentas finales con saldo 0.
insert into public.cuentas (nombre, saldo)
values
  ('SANTANDER VALENCHO', 0),
  ('SANTANDER FRANCISCO', 0),
  ('VALENCHO MERCADO PAGO', 0),
  ('FRANCISCO MERCADO PAGO', 0),
  ('EFECTIVO', 0)
on conflict (nombre) do nothing;

-- 2) Migrar saldos desde nombres viejos hacia los nuevos (sumando).
do $$
declare
  v_saldo numeric;
begin
  -- VALENCHO SANTANDER -> SANTANDER VALENCHO
  select saldo into v_saldo from public.cuentas where nombre = 'VALENCHO SANTANDER';
  if v_saldo is not null then
    update public.cuentas set saldo = saldo + v_saldo where nombre = 'SANTANDER VALENCHO';
    delete from public.cuentas where nombre = 'VALENCHO SANTANDER';
  end if;

  -- FRANCISCO SANTANDER -> SANTANDER FRANCISCO
  select saldo into v_saldo from public.cuentas where nombre = 'FRANCISCO SANTANDER';
  if v_saldo is not null then
    update public.cuentas set saldo = saldo + v_saldo where nombre = 'SANTANDER FRANCISCO';
    delete from public.cuentas where nombre = 'FRANCISCO SANTANDER';
  end if;

  -- VALENCHO MERCADO PAGO 1 + 2 -> VALENCHO MERCADO PAGO
  select coalesce(sum(saldo), 0) into v_saldo
    from public.cuentas
    where nombre in ('VALENCHO MERCADO PAGO 1', 'VALENCHO MERCADO PAGO 2');
  if v_saldo <> 0 then
    update public.cuentas set saldo = saldo + v_saldo where nombre = 'VALENCHO MERCADO PAGO';
  end if;
  delete from public.cuentas
    where nombre in ('VALENCHO MERCADO PAGO 1', 'VALENCHO MERCADO PAGO 2');
end $$;

-- 3) Re-etiquetar referencias en tablas hijas (cuenta como texto).
update public.movimientos
   set cuenta = 'SANTANDER VALENCHO'      where cuenta = 'VALENCHO SANTANDER';
update public.movimientos
   set cuenta = 'SANTANDER FRANCISCO'     where cuenta = 'FRANCISCO SANTANDER';
update public.movimientos
   set cuenta = 'VALENCHO MERCADO PAGO'   where cuenta in ('VALENCHO MERCADO PAGO 1','VALENCHO MERCADO PAGO 2');

update public.pagos_proveedor
   set cuenta = 'SANTANDER VALENCHO'      where cuenta = 'VALENCHO SANTANDER';
update public.pagos_proveedor
   set cuenta = 'SANTANDER FRANCISCO'     where cuenta = 'FRANCISCO SANTANDER';
update public.pagos_proveedor
   set cuenta = 'VALENCHO MERCADO PAGO'   where cuenta in ('VALENCHO MERCADO PAGO 1','VALENCHO MERCADO PAGO 2');

update public.ingresos_desglose
   set cuenta = 'SANTANDER VALENCHO'      where cuenta = 'VALENCHO SANTANDER';
update public.ingresos_desglose
   set cuenta = 'SANTANDER FRANCISCO'     where cuenta = 'FRANCISCO SANTANDER';
update public.ingresos_desglose
   set cuenta = 'VALENCHO MERCADO PAGO'   where cuenta in ('VALENCHO MERCADO PAGO 1','VALENCHO MERCADO PAGO 2');
