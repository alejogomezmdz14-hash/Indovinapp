-- Indovina: rellenar public.perfiles para usuarios que ya existen en auth.users
-- Ejecutar en Supabase → SQL Editor (proyecto Indovina, NO Technito).
-- Tip: para ver IDs y emails antes:
--   select id, email, raw_user_meta_data from auth.users order by created_at;

insert into public.perfiles (id, nombre_visible, rol)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(u.email, '@', 1)
  ) as nombre_visible,
  case
    when lower(coalesce(u.raw_user_meta_data ->> 'rol', '')) = 'admin' then 'admin'::text
    else 'empleado'::text
  end as rol
from auth.users u
where not exists (select 1 from public.perfiles p where p.id = u.id)
on conflict (id) do nothing;

-- Opcional: marcar un usuario como admin por email (ajustá el correo):
-- insert into public.perfiles (id, nombre_visible, rol)
-- select id, coalesce(raw_user_meta_data->>'full_name', split_part(email,'@',1)), 'admin'
-- from auth.users where email = 'tu@email.com'
-- on conflict (id) do update set rol = excluded.rol, nombre_visible = coalesce(excluded.nombre_visible, public.perfiles.nombre_visible);
