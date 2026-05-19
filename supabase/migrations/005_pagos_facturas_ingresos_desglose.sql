-- Indovina: pagos imputables a facturas, fecha de carga y desglose de ingresos.
-- Cambios incrementales: agrega columnas/tablas sin borrar la estructura existente.

alter table public.movimientos
  add column if not exists cuenta text not null default '',
  add column if not exists fecha_carga date not null default current_date;

alter table public.facturas_proveedor
  add column if not exists fecha_carga date not null default current_date;

create index if not exists movimientos_cuenta_idx on public.movimientos (cuenta);
create index if not exists movimientos_fecha_carga_idx on public.movimientos (fecha_carga);
create index if not exists facturas_proveedor_fecha_carga_idx on public.facturas_proveedor (fecha_carga);

-- Pago registrado a un proveedor. Puede venir de Telegram/n8n o de la app.
create table if not exists public.pagos_proveedor (
  id uuid primary key default gen_random_uuid(),
  fecha text not null,
  fecha_carga date not null default current_date,
  proveedor text not null,
  cuenta text not null default '',
  monto numeric(14, 2) not null check (monto > 0),
  comentario text not null default '',
  origen text not null default 'manual' check (origen in ('manual', 'n8n', 'app', 'import')),
  created_at timestamptz not null default now()
);

create index if not exists pagos_proveedor_proveedor_idx on public.pagos_proveedor (proveedor);
create index if not exists pagos_proveedor_fecha_idx on public.pagos_proveedor (fecha);
create index if not exists pagos_proveedor_fecha_carga_idx on public.pagos_proveedor (fecha_carga);

-- Imputación de pagos a facturas. Un pago puede cubrir varias facturas y una factura puede recibir pagos parciales.
create table if not exists public.pagos_facturas (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos_proveedor (id) on delete cascade,
  factura_id uuid not null references public.facturas_proveedor (id) on delete cascade,
  monto_aplicado numeric(14, 2) not null check (monto_aplicado > 0),
  created_at timestamptz not null default now(),
  constraint pagos_facturas_pago_factura_unique unique (pago_id, factura_id)
);

create index if not exists pagos_facturas_pago_idx on public.pagos_facturas (pago_id);
create index if not exists pagos_facturas_factura_idx on public.pagos_facturas (factura_id);

-- Desglose de ingresos por movimiento/cuenta/forma: QR, CREDITO, DEBITO, ALIAS, EFECTIVO, etc.
create table if not exists public.ingresos_desglose (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references public.movimientos (id) on delete cascade,
  cuenta text not null,
  forma text not null,
  monto numeric(14, 2) not null check (monto > 0),
  created_at timestamptz not null default now()
);

create index if not exists ingresos_desglose_movimiento_idx on public.ingresos_desglose (movimiento_id);
create index if not exists ingresos_desglose_cuenta_forma_idx on public.ingresos_desglose (cuenta, forma);

alter table public.pagos_proveedor enable row level security;
alter table public.pagos_facturas enable row level security;
alter table public.ingresos_desglose enable row level security;

create policy "pp_select_auth" on public.pagos_proveedor for select to authenticated using (true);
create policy "pp_insert_auth" on public.pagos_proveedor for insert to authenticated with check (true);
create policy "pp_update_auth" on public.pagos_proveedor for update to authenticated using (true) with check (true);
create policy "pp_delete_auth" on public.pagos_proveedor for delete to authenticated using (true);

create policy "pf_select_auth" on public.pagos_facturas for select to authenticated using (true);
create policy "pf_insert_auth" on public.pagos_facturas for insert to authenticated with check (true);
create policy "pf_update_auth" on public.pagos_facturas for update to authenticated using (true) with check (true);
create policy "pf_delete_auth" on public.pagos_facturas for delete to authenticated using (true);

create policy "id_select_auth" on public.ingresos_desglose for select to authenticated using (true);
create policy "id_insert_auth" on public.ingresos_desglose for insert to authenticated with check (true);
create policy "id_update_auth" on public.ingresos_desglose for update to authenticated using (true) with check (true);
create policy "id_delete_auth" on public.ingresos_desglose for delete to authenticated using (true);
