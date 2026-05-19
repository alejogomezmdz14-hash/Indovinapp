-- Indovina / Indovinapp — esquema inicial (Postgres / Supabase)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar → Run
-- O con CLI: supabase db push / supabase migration up (si usás Supabase CLI linkeado)

-- ---------------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------------
-- gen_random_uuid() está disponible en Postgres moderno sin extensión extra.

-- ---------------------------------------------------------------------------
-- Cuentas (equivalente a pestaña "Cuentas ": nombre + saldo)
-- ---------------------------------------------------------------------------
create table if not exists public.cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  saldo numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cuentas_nombre_unique unique (nombre)
);

create index if not exists cuentas_nombre_idx on public.cuentas (nombre);

-- ---------------------------------------------------------------------------
-- Libro diario / movimientos (columnas A–H como en Google Sheets)
-- ---------------------------------------------------------------------------
create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha text not null,
  monto numeric(14, 2) not null,
  proveedor text not null default '',
  categoria text not null default '',
  comentario text not null default '',
  tipo_comprobante text not null default '',
  numero_comprobante text not null default '',
  fecha_vencimiento text not null default '',
  origen text not null default 'manual' check (origen in ('manual', 'n8n', 'foto', 'import')),
  created_at timestamptz not null default now()
);

create index if not exists movimientos_fecha_idx on public.movimientos (fecha);
create index if not exists movimientos_proveedor_idx on public.movimientos (proveedor);

-- ---------------------------------------------------------------------------
-- Cheques (hoja "cheques": A referencia opcional, B proveedor, C monto, D vencimiento)
-- ---------------------------------------------------------------------------
create table if not exists public.cheques (
  id uuid primary key default gen_random_uuid(),
  referencia text not null default '',
  proveedor text not null,
  monto numeric(14, 2) not null,
  fecha_vencimiento text not null,
  created_at timestamptz not null default now()
);

create index if not exists cheques_vencimiento_idx on public.cheques (fecha_vencimiento);

-- ---------------------------------------------------------------------------
-- Facturas proveedores (hoja "proveedores": A referencia, B proveedor, C monto, D vencimiento)
-- ---------------------------------------------------------------------------
create table if not exists public.facturas_proveedor (
  id uuid primary key default gen_random_uuid(),
  referencia text not null default '',
  proveedor text not null,
  monto numeric(14, 2) not null,
  fecha_vencimiento text not null,
  created_at timestamptz not null default now()
);

create index if not exists facturas_proveedor_venc_idx on public.facturas_proveedor (fecha_vencimiento);

-- ---------------------------------------------------------------------------
-- Estado del bot (Telegram / n8n): conversación por usuario
-- ---------------------------------------------------------------------------
create table if not exists public.bot_sesiones (
  telegram_user_id bigint primary key,
  flujo text not null default '',
  paso int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Perfiles (opcional, enlazado a Supabase Auth cuando actives login)
-- ---------------------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre_visible text,
  rol text not null default 'empleado' check (rol in ('admin', 'empleado')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: usuarios autenticados (JWT de la app) ven y editan todo el negocio.
-- n8n con service_role NO pasa por RLS (bypass en PostgREST).
-- ---------------------------------------------------------------------------
alter table public.cuentas enable row level security;
alter table public.movimientos enable row level security;
alter table public.cheques enable row level security;
alter table public.facturas_proveedor enable row level security;
alter table public.bot_sesiones enable row level security;
alter table public.perfiles enable row level security;

-- Políticas para rol authenticated (navegador con sesión Supabase Auth)
create policy "cuentas_select_auth" on public.cuentas for select to authenticated using (true);
create policy "cuentas_insert_auth" on public.cuentas for insert to authenticated with check (true);
create policy "cuentas_update_auth" on public.cuentas for update to authenticated using (true) with check (true);
create policy "cuentas_delete_auth" on public.cuentas for delete to authenticated using (true);

create policy "mov_select_auth" on public.movimientos for select to authenticated using (true);
create policy "mov_insert_auth" on public.movimientos for insert to authenticated with check (true);
create policy "mov_update_auth" on public.movimientos for update to authenticated using (true) with check (true);
create policy "mov_delete_auth" on public.movimientos for delete to authenticated using (true);

create policy "chq_select_auth" on public.cheques for select to authenticated using (true);
create policy "chq_insert_auth" on public.cheques for insert to authenticated with check (true);
create policy "chq_update_auth" on public.cheques for update to authenticated using (true) with check (true);
create policy "chq_delete_auth" on public.cheques for delete to authenticated using (true);

create policy "fp_select_auth" on public.facturas_proveedor for select to authenticated using (true);
create policy "fp_insert_auth" on public.facturas_proveedor for insert to authenticated with check (true);
create policy "fp_update_auth" on public.facturas_proveedor for update to authenticated using (true) with check (true);
create policy "fp_delete_auth" on public.facturas_proveedor for delete to authenticated using (true);

-- bot_sesiones: RLS activo, sin políticas para anon/authenticated → solo service_role (n8n) vía bypass.

create policy "perfiles_select_own" on public.perfiles for select to authenticated using (auth.uid() = id);
create policy "perfiles_insert_own" on public.perfiles for insert to authenticated with check (auth.uid() = id);
create policy "perfiles_update_own" on public.perfiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Seed: cuentas canónicas (saldo 0; actualizás después desde la app o n8n)
-- ---------------------------------------------------------------------------
insert into public.cuentas (nombre, saldo)
values
  ('VALENCHO MERCADO PAGO 1', 0),
  ('VALENCHO MERCADO PAGO 2', 0),
  ('VALENCHO SANTANDER', 0),
  ('FRANCISCO MERCADO PAGO', 0),
  ('FRANCISCO SANTANDER', 0),
  ('EFECTIVO', 0)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- Trigger updated_at en cuentas
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cuentas_updated on public.cuentas;
create trigger trg_cuentas_updated
before update on public.cuentas
for each row execute function public.set_updated_at();

drop trigger if exists trg_bot_sesiones_updated on public.bot_sesiones;
create trigger trg_bot_sesiones_updated
before update on public.bot_sesiones
for each row execute function public.set_updated_at();
