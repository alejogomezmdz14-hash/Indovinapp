-- Indovina: agregar foto_url a cheques.
-- El subflow n8n "SF – Indovina / Cheque" ya manda foto_url (vacío hoy, foto en el futuro).
-- Sin esta columna el autoMap del nodo Supabase falla con PGRST204.

alter table public.cheques
  add column if not exists foto_url text not null default '';
