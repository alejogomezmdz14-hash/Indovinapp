# Indovinapp — guía para asistentes (Claude / Cursor)

## Qué es

Panel web **Next.js 14** para **Indovina Lomos**. UI en español.

## Arquitectura objetivo (fuente de verdad)

- **Supabase (Postgres + API)** es el **backend único**: tablas para cuentas, movimientos, cheques, facturas, etc.
- **n8n** (Telegram, facturas por foto, subflujos) debe **leer y escribir en Supabase**, no en Google Sheets como sistema principal. Así lo que cargue Francisco por chat **queda en la misma base** que consume la app y se puede reflejar al instante (**Supabase Realtime** en el cliente o refetch tras eventos).
- **Google Sheets** puede quedar como **respaldo, exportación o migración histórica** si hace falta, pero no como “verdad” paralela (evita dos fuentes desincronizadas).

### Estado del código hoy

- La app **aún** usa **Google Sheets** en [`src/lib/googleSheets.ts`](src/lib/googleSheets.ts). La migración pendiente es: **misma forma de datos**, pero persistencia y lecturas vía **Supabase** (`@supabase/supabase-js` o server client con service role donde corresponda).

## Stack

- **Next.js 14** (App Router), React 18, Tailwind.
- **Supabase** (objetivo): URL + anon (cliente) y service role solo en servidor para operaciones privilegiadas.
- **googleapis** (Sheets): transición / legado mientras exista [`src/lib/googleSheets.ts`](src/lib/googleSheets.ts).
- Esquema SQL inicial: [`supabase/migrations/001_indovina_core.sql`](supabase/migrations/001_indovina_core.sql) y guía n8n + Supabase: [`n8n/CONECTAR.md`](n8n/CONECTAR.md).

## Variables de entorno (nombres; valores en `.env`, no commitear)

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon (cliente / RLS). |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor: tareas que no deben depender del JWT del usuario (o n8n vía API con cuidado de seguridad). |
| `GOOGLE_SHEET_ID` | (Transición) ID spreadsheet si sigue sync/export a Sheets. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` | (Transición) Cuenta de servicio Sheets. |
| `N8N_API_URL` / `N8N_API_KEY` | MCP n8n en Cursor ([`.cursor/mcp.json`](.cursor/mcp.json)). En **n8n Cloud/self-host**, configurar credenciales **Supabase** en los workflows. |
| `OPENAI_API_KEY` | Visión / OCR (web o n8n). |
| `NEXT_PUBLIC_PAIS` | Texto en sidebar (ej. país). |

`.env` está en `.gitignore`.

## Modelo de datos (alinear Supabase con esto)

Al diseñar tablas en Supabase, **mapear** lo que hoy son pestañas/columnas en Sheets (misma semántica para que el dashboard no cambie de significado). Referencia del código legado:

## Google Sheets — pestañas y rangos (código actual / legado)

Respetar **mayúsculas/minúsculas** de nombres de pestaña.

| Pestaña | Rango leído / append | Uso en app |
|---------|----------------------|------------|
| `Cuentas ` (con espacio al final) | `A2:B` | Nombre cuenta + saldo. |
| `Libro diario` | `A2:H` / append `A:H` | Movimientos. |
| `cheques` | `A2:D` | Cheques. |
| `proveedores` | `A2:D` / append `A:D` | Facturas proveedores. |

Columnas de **Libro diario** (orden en código): fecha, monto, proveedor, categoría, comentario, tipo comprobante, n° comprobante, vencimiento.

## Cuentas canónicas (orden en UI)

Definidas en [`src/config/cuentas.ts`](src/config/cuentas.ts). Los nombres en la columna A de `Cuentas ` deben coincidir **exactamente**:

1. VALENCHO MERCADO PAGO 1  
2. VALENCHO MERCADO PAGO 2  
3. VALENCHO SANTANDER  
4. FRANCISCO MERCADO PAGO  
5. FRANCISCO SANTANDER  
6. EFECTIVO  

## Rutas principales

- `/` — Dashboard (cuentas, cheques, proveedores, métricas).
- `/libro-diario`, `/cheques`, `/proveedores`, `/exportar`.

## Automatización (n8n + Telegram)

- **Flujo padre** en n8n + **subflujos** por intención (gasto, cheque, proveedor, factura foto, etc.).
- Cada subflujo debe hacer **insert/update en Supabase** (HTTP Request al REST de Supabase, nodo Postgres, o Supabase community node).
- La app Next debe **leer Supabase**; opcional **Realtime** (`postgres_changes`) en componentes cliente para ver reflejados al momento los inserts que haga n8n.

## Convenciones al tocar código

- Cambios acotados al pedido; no refactors masivos sin que lo pidan.
- No commitear `.env`, JSON de cuenta de servicio ni API keys.
- Tras cambios en Supabase, esquema o env, verificar `npm run build` / `next lint` cuando aplique.
