-- Indovina: guardar URL de la foto subida a Google Drive en facturas_proveedor.
-- Ejecutar en Supabase → SQL Editor.

alter table public.facturas_proveedor
  add column if not exists foto_url text not null default '';
