-- Indovina: función atómica para descontar (o sumar) saldo a una cuenta.
-- Llamar vía Supabase RPC: POST /rest/v1/rpc/descontar_saldo
-- Body: { "p_cuenta": "EFECTIVO", "p_monto": 5000 }
-- p_monto positivo = gasto (resta), p_monto negativo = ingreso (suma).

create or replace function public.descontar_saldo(p_cuenta text, p_monto numeric)
returns numeric
language plpgsql
security definer
as $$
declare
  v_saldo numeric;
begin
  update public.cuentas
    set saldo = saldo - p_monto
    where nombre = p_cuenta
    returning saldo into v_saldo;

  if v_saldo is null then
    raise exception 'Cuenta % no existe', p_cuenta;
  end if;

  return v_saldo;
end;
$$;

revoke all on function public.descontar_saldo(text, numeric) from public;
grant execute on function public.descontar_saldo(text, numeric) to service_role;
grant execute on function public.descontar_saldo(text, numeric) to authenticated;
