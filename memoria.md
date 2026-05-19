# Memoria del proyecto — Indovinapp

Documento vivo para **contexto y decisiones**. Actualizar cuando cambien datos, flujos o reglas de negocio.

## Producto

- **Usuario principal:** Francisco (y quien opere el panel / Telegram).
- **Objetivo:** que todo lo cargado (web o chat) viva en un **solo backend** y el dashboard lo refleje **sin depender de copias manuales** entre sistemas.

## Arquitectura acordada (importante)

### Supabase = backend único

- **Toda la persistencia “de producto”** (cuentas, movimientos/gastos, cheques, facturas, estados de bot, etc.) debe ir a **Supabase** (Postgres).
- La aplicación Next debe **leer y escribir Supabase** (con RLS y políticas según usuarios, cuando haya más de un rol).
- **Reflejo automático en la app:** cuando n8n (o la web) inserta/actualiza filas, la UI puede actualizarse con **Supabase Realtime** (suscripción `postgres_changes`) o con revalidación/refetch según el patrón que elijamos en código.

### n8n conectado a Supabase (no a Sheets como verdad)

- Los **flujos padre + subflujos** (Telegram, foto de factura, conversaciones por “tipo de registro”) deben usar **Supabase** como destino (REST `https://<ref>.supabase.co/rest/v1/...` con `apikey` + `Authorization: Bearer <service_role o anon según política>`, nodo **Postgres**, o nodo dedicado Supabase).
- Así lo que Francisco cargue por **Telegram** queda en las **mismas tablas** que mira el dashboard.

### Google Sheets

- **Hoy** el código aún usa Sheets en `src/lib/googleSheets.ts` (transición).
- **Dirección:** Sheets como **export**, **import inicial** o archivo muerto; **no** como segunda base viva en paralelo con Supabase (evita desalineación).

## Decisiones de negocio (siguen vigentes)

### Regla de trabajo compartido Cursor / Claude terminal

- **Actualizar este archivo siempre que haya cambios de producto, datos, deploy o arquitectura.**
- Motivo: el proyecto también se trabaja con Claude en terminal; `memoria.md` es la fuente de contexto compartida para mantener ambas sesiones sincronizadas.
- Antes de cerrar una tarea importante, dejar acá: qué cambió, qué migraciones se aplicaron, qué falta conectar y cómo verificar.

### Cuentas canónicas (nombres)

Orden y nombres exactos (aplican igual en tabla `cuentas` o equivalente en Supabase):

- VALENCHO MERCADO PAGO 1  
- VALENCHO MERCADO PAGO 2  
- VALENCHO SANTANDER  
- FRANCISCO MERCADO PAGO  
- FRANCISCO SANTANDER  
- EFECTIVO  

### País

- **`NEXT_PUBLIC_PAIS`** en `.env` para mostrar en el sidebar.

### Factura por foto

- **Web:** flujo actual con OpenAI + append (hoy a Sheets en transición → debe pasar a **tablas Supabase**).
- **Telegram:** foto vía Bot API → visión/LLM → **insert en Supabase** (sin obligar Google Drive para guardar el archivo).

### Libro diario / ingresos

- Se acordó que el **Libro diario** mantenga la tabla general de movimientos, pero agregue un **resumen desplegable de ingresos por fecha + cuenta**.
- El desglose de ingresos aplica a **cobros/ingresos del negocio**, no a pagos a proveedores.
- Formas iniciales por cuenta:
  - **VALENCHO SANTANDER:** QR, CREDITO, DEBITO.
  - **FRANCISCO SANTANDER:** QR, CREDITO, DEBITO.
  - **VALENCHO MERCADO PAGO:** ALIAS.
  - **FRANCISCO MERCADO PAGO:** ALIAS.
  - **EFECTIVO:** EFECTIVO.
- Todo movimiento/factura debe guardar **fecha de carga** automática, pero editable cuando se carguen datos atrasados.

### Proveedores / pagos

- La pantalla de **Proveedores** debe mostrar un **resumen por proveedor**: deuda pendiente, estado general y facturas asociadas.
- Al abrir un proveedor se ve el detalle por factura: monto original, pagado, saldo pendiente, vencimiento y fecha de carga.
- Los pagos a proveedores pueden aplicarse a **una o varias facturas**, con **pagos parciales**.
- La app web permite revisar/corregir y registrar imputaciones; Telegram/n8n debe escribir el mismo modelo de Supabase.

### Telegram / n8n (comportamiento)

- Flujo padre + subflujos por intención / “hoja lógica”.
- Estado de conversación: pestaña oculta en Sheets **o** (preferido) tabla `bot_sessions` / similar en **Supabase**.

## Pendientes / migración

- Esquema inicial Postgres: [`supabase/migrations/001_indovina_core.sql`](supabase/migrations/001_indovina_core.sql).
- Migraciones aplicadas en Supabase proyecto `dtbmzlncbtxcxdujkrko` el 2026-05-19:
  - `perfiles_desde_auth_users`
  - `facturas_foto_url`
  - `descontar_saldo`
  - `pagos_facturas_ingresos_desglose`
- La nueva migración principal está en [`supabase/migrations/005_pagos_facturas_ingresos_desglose.sql`](supabase/migrations/005_pagos_facturas_ingresos_desglose.sql) y agrega:
  - `movimientos.cuenta`
  - `movimientos.fecha_carga`
  - `facturas_proveedor.fecha_carga`
  - `pagos_proveedor`
  - `pagos_facturas`
  - `ingresos_desglose`
- Guía para conectar n8n + variables + REST: [`n8n/CONECTAR.md`](n8n/CONECTAR.md).
- Next ya lee principalmente desde `src/lib/data.ts` contra Supabase, con fallback acotado para no romper si falta una migración.
- En **n8n**, falta ajustar los flujos de Telegram para escribir:
  - ingresos con `movimientos.cuenta` + filas en `ingresos_desglose`;
  - pagos a proveedores en `pagos_proveedor` + `pagos_facturas`.
- Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (servidor / n8n según política de seguridad).

## Cambios implementados el 2026-05-19

- `Libro diario`: resumen desplegable de ingresos por fecha/cuenta con desglose por forma de cobro.
- `Proveedores`: resumen por proveedor con deuda, estado, facturas, pagado y saldo pendiente.
- API web para registrar pagos/imputaciones: `src/app/api/proveedores/pagos/route.ts`.
- Helper testeado para cálculos financieros: `src/lib/resumenesFinancieros.js`.
- Prueba mínima: `scripts/test-resumenes-financieros.mjs` y script `npm run test:resumenes`.
- Verificación local antes de deploy:
  - `npm run test:resumenes` OK.
  - `npm run build` OK.

## Referencias rápidas en repo

| Qué | Dónde |
|-----|--------|
| Sheets (legado) | `src/lib/googleSheets.ts` |
| Cuentas canónicas | `src/config/cuentas.ts` |
| País UI | `src/config/site.ts`, `src/app/layout.tsx` |
| Factura foto (web) | `src/app/api/facturas/desde-foto/route.ts`, `src/components/proveedores/FacturaFotoUploader.tsx` |
| Resumen financiero | `src/lib/resumenesFinancieros.js`, `scripts/test-resumenes-financieros.mjs` |
| Pagos proveedores | `src/app/api/proveedores/pagos/route.ts`, `src/app/proveedores/page.tsx` |
| Desglose ingresos | `src/app/libro-diario/page.tsx`, `src/config/formasIngreso.ts` |
| Guía para IA | `claude.md` |

---

*Última decisión explícita: mantener `memoria.md` actualizado en cada cambio importante para sincronizar Cursor y Claude terminal; backend en **Supabase**; **n8n** debe escribir el nuevo modelo de ingresos/pagos para que los cambios impacten la app de forma automática y consistente.*
