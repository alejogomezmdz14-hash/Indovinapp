# Conectar Supabase + n8n (Indovina)

## 1. Datos que necesito de vos (sin pegar secretos en chats públicos)

Copiá en un lugar seguro (n8n “Credentials” / variables de entorno / `.env` local):

| Dato | Dónde lo ves |
|------|----------------|
| **URL del proyecto** | Supabase → Settings → API → Project URL (`https://xxxxx.supabase.co`) |
| **anon public key** | Misma pantalla → `anon` `public` (legacy) o **Publishable** (nuevo modelo de keys) |
| **service_role key** | Misma pantalla → `service_role` / **secret** — **solo servidor y n8n**, nunca en el navegador ni en el repo |
| **Telegram Bot Token** | @BotFather |
| **OpenAI API key** (si usás visión en n8n) | OpenAI dashboard |

Con eso alcanza para: **n8n → REST de Supabase** y más adelante **Next → Supabase** con `anon` + sesión de usuario.

---

## 2. Crear todas las tablas (comando / archivo SQL)

El archivo del repo es:

**[`supabase/migrations/001_indovina_core.sql`](../supabase/migrations/001_indovina_core.sql)**

### Opción A — Supabase Dashboard (recomendado ahora)

1. Abrí tu proyecto en [Supabase](https://supabase.com/dashboard).
2. **SQL Editor** → **New query**.
3. Pegá el contenido **completo** de `001_indovina_core.sql`.
4. **Run**.

Si ya corriste el script antes y falla por “policy already exists”, avisame y te paso una versión `DROP POLICY IF EXISTS ...` idempotente.

### Opción B — Supabase CLI (si ya tenés el proyecto linkeado)

```bash
cd ruta/al/repo/indovinapp
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

(O colocá el SQL en `supabase/migrations/` y aplicá con tu flujo habitual de migraciones.)

---

## 3. Qué crea el SQL (resumen)

| Tabla | Uso |
|--------|-----|
| `cuentas` | Nombre + saldo (las 6 cuentas canónicas se insertan con saldo 0). |
| `movimientos` | Libro diario (mismas columnas que la hoja A–H + `origen`). |
| `cheques` | Cheques con referencia opcional. |
| `facturas_proveedor` | Facturas de proveedores (referencia, proveedor, monto, vencimiento). |
| `bot_sesiones` | Estado del bot Telegram por `telegram_user_id` (JSON `payload`). |
| `perfiles` | Opcional: ligado a `auth.users` cuando actives login en la app. |

**RLS:** usuarios `authenticated` pueden CRUD en tablas de negocio; `bot_sesiones` queda sin políticas para JWT (solo n8n con **service_role** que **bypasea** RLS).

---

## 4. n8n: cómo pegarle a Supabase (patrón único)

En cada workflow que inserte/lea datos:

1. Nodo **HTTP Request** (o nodo Postgres si preferís conexión directa).
2. **POST** ejemplo movimiento:

- **URL:** `https://TU_REF.supabase.co/rest/v1/movimientos`
- **Headers:**
  - `apikey`: `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}` (mejor: **Credential** tipo Header Auth, no texto plano en el nodo).
  - `Authorization`: `Bearer <mismo service role>`
  - `Content-Type`: `application/json`
  - `Prefer`: `return=minimal`

3. **Body (JSON)** mínimo:

```json
{
  "fecha": "13/05/2026",
  "monto": -1500,
  "proveedor": "Proveedor X",
  "categoria": "Factura (foto)",
  "comentario": "Detalle",
  "tipo_comprobante": "Factura",
  "numero_comprobante": "123",
  "fecha_vencimiento": "01/06/2026",
  "origen": "n8n"
}
```

**GET** (listar): `GET .../rest/v1/movimientos?select=*` con los mismos headers.

**PATCH** (ej. saldo de cuenta):  
`PATCH .../rest/v1/cuentas?nombre=eq.VALENCHO%20MERCADO%20PAGO%201`  
Body: `{ "saldo": 12345.67 }`  
Header `Prefer: return=minimal`

En n8n definí variables de entorno (Settings → Variables), por ejemplo:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (marcá como sensitive)

---

## 5. “Todos los flujos” — mapa sugerido (subflujos)

No puedo ejecutar n8n en tu servidor desde acá; sí podés armar estos **Execute Workflow** desde el flujo padre Telegram:

| Subflujo | Acción principal en Supabase |
|----------|---------------------------------|
| `01_menu` | Responde con teclado inline (Gasto / Cheque / Proveedor / Factura foto / Cancelar). |
| `02_gasto` | Lee/escribe `bot_sesiones` → al confirmar: `INSERT movimientos` (`origen`: `n8n`). |
| `03_cheque` | `INSERT cheques`. |
| `04_proveedor_factura` | `INSERT facturas_proveedor` (+ opcional `movimientos` si querés desglose). |
| `05_factura_foto` | Telegram file → descarga → OpenAI → `INSERT facturas_proveedor` + líneas en `movimientos` (como en la app). |
| `06_actualizar_saldo_cuenta` | `PATCH cuentas` por `nombre=eq...`. |

Todos comparten: **misma URL base** y **service_role** en headers (o Postgres con usuario `postgres` + connection string — otra vía válida).

---

## 6. Próximo paso en el repo Next (cuando quieras)

Sustituir `src/lib/googleSheets.ts` por lecturas `supabase.from('movimientos').select(...)` etc., y variables `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` en la app.

---

*Si me pasás solo el **project ref** (subdominio antes de `.supabase.co`) sin keys, puedo ayudarte a revisar URLs de REST y matchers de n8n.*

---

## 7. Easypanel (servicio n8n) — variables para copiar y pegar

En Easypanel: **tu stack / app de n8n → Environment** (o el editor de env del contenedor). Creá **una línea por variable** (nombre exacto a la izquierda, valor a la derecha). **No pegues keys reales en chats públicos**; acá van **placeholders** que vos reemplazás con tus valores.

### 7.1 Supabase (solo servidor / n8n)

```env
SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=PEGÁ_AQUÍ_LA_SERVICE_ROLE_DE_SUPABASE_SETTINGS_API
```

En los nodos HTTP de n8n, la URL del REST suele ser `{{ $env.SUPABASE_URL }}/rest/v1/...` y el header `Authorization: Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}` (y `apikey` igual).

### 7.2 Google Sheets (ID de planilla)

```env
GOOGLE_SHEET_ID=PEGÁ_AQUÍ_EL_ID_DE_LA_URL_DE_LA_PLANILLA
```

El ID es el tramo largo entre `/d/` y `/edit` en la URL del archivo de Google Sheets.

### 7.3 OpenAI (si el flujo usa modelo / visión)

```env
OPENAI_API_KEY=PEGÁ_TU_KEY_DE_OPENAI
```

### 7.4 n8n (URLs y herramientas del agente)

```env
WEBHOOK_URL=https://TU_DOMINIO_PUBLICO_DE_N8N/
N8N_HOST=https://TU_DOMINIO_PUBLICO_DE_N8N
N8N_PROTOCOL=https
N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
```

- **`WEBHOOK_URL`**: URL base **pública** con la que Telegram y otros webhooks llegan a tu n8n (terminá en `/` si tu instalación lo pide así en la doc que uses).
- **`N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE`**: en `true` si usás nodos tipo **AI Agent** / **Call n8n Sub-Workflow Tool** que lo requieran.

### 7.5 Telegram (si lo ponés por env en vez de credencial)

```env
TELEGRAM_BOT_TOKEN=PEGÁ_EL_TOKEN_DE_BOTFATHER
```

(Si el token solo está en **Credentials** de n8n, esta variable no hace falta.)

### 7.6 Resumen checklist

1. **Supabase:** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (nunca en el frontend Next; en n8n sí, solo en el servidor).
2. **Sheets:** `GOOGLE_SHEET_ID` + credencial de **Google Service Account** en n8n (misma cuenta con acceso **Editor** a la planilla).
3. **Dominio:** `WEBHOOK_URL` / `N8N_HOST` coinciden con la URL **HTTPS** que abrís desde afuera (no `localhost`).

---

## 8. Login en la app Next (Vercel)

La app usa **Supabase Auth** con email + contraseña. En **Vercel → Project → Settings → Environment Variables** tenés que tener:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PEGÁ_LA_ANON_PUBLIC_KEY
```

En **Supabase → Authentication → URL configuration**: agregá **Site URL** `https://indovinapp.vercel.app` (o tu dominio) y en **Redirect URLs** la misma base si te lo pide el flujo.

Cada usuario debe tener **contraseña** (en Dashboard: **Users → usuario → Send magic link / Set password** o invitación con password).

---

## 9. Flujos Indovina en producción (Easypanel / n8n)

Instancia API (referencia): `https://n8n1-n8n-indovina.tq5lfi.easypanel.host` — ajustá si tu dominio difiere.

### 9.1 Mapa de workflows (IDs fijos)

| ID | Nombre | Activo en prod. |
|----|--------|------------------|
| `rFh6ARtAiROZ4Ors` | **Indovina – Telegram (padre)** | **Sí** — único con trigger Telegram; registra el webhook. |
| `OcPG64aOIccaaEZW` | SF – Indovina / Gasto | **No** — lo llama el AI Agent como sub-workflow. |
| `iOAvoQaSdY7OmNHt` | SF – Indovina / Cheque | **No** |
| `CFovQKG2RvJ7OEFB` | SF – Indovina / Factura proveedor | **No** |
| `nT0MGKF7URJySwZM` | SF – Indovina / Factura foto | **No** (stub: inserta fila genérica; falta pipeline foto → OCR si querés producción real de imágenes). |

**Importante:** si activás los SF por error, duplicás triggers o rompés el modelo “padre + herramientas”.

**Nodos “Supabase”:** los cuatro SF usan el nodo nativo **Supabase** (Resource **Row**, Operation **Create**, mapeo automático desde el nodo Code anterior) y la credencial **`Indovina Supabase API`** (host del proyecto + **service_role** de Supabase → Settings → API). No uses la clave **anon** ahí.

**Si n8n devuelve 405 a `GET /api/v1/credentials`:** el script `swap-sf-http-to-supabase-native.mjs` crea la credencial solo con **POST** y admite `INDOVINA_SUPABASE_CREDENTIAL_ID` en `.env` si ya existe una credencial `supabaseApi` en la UI.

**Si n8n muestra “Install this node” en un nodo raro:** suele ser por **nombre de nodo con caracteres especiales** (p. ej. la flecha `→`). Los SF usan nombres ASCII (`Insert … Supabase`). Guardá de nuevo el workflow si hacía falta.

**Re-aplicar el swap desde el repo** (otro entorno o clon), con `.env` completo:

`node n8n/swap-sf-http-to-supabase-native.mjs`

(Requiere `N8N_API_URL`, `N8N_API_KEY`, URL de Supabase y `SUPABASE_SERVICE_ROLE_KEY`, o bien `INDOVINA_SUPABASE_CREDENTIAL_ID`.)

**“Publicar” en n8n:** guardá el workflow (Save). Los SF **no** deben estar en verde “Active” como flujo con cron; solo el **padre** Telegram activo. Los subflujos se ejecutan igual cuando el agente los llama.

### 9.2 Validación (runtime)

El flujo padre debe tener el nodo **Send a text message** (Telegram) con **`resource: message`** y **`operation: sendMessage`**. Sin eso, la validación falla y Telegram puede no enviar respuestas.

### 9.3 Variables obligatorias en el contenedor n8n

Además del bloque del **§7**, confirmá **`N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`** si usás **AI Agent** y **Tool Workflow**.

### 9.4 Scripts del repo (por si re-aplicás el diseño)

- `n8n/patch-parent-agent-tools.mjs` — padre: herramientas → AI Agent, `systemMessage`, Telegram send.
- `n8n/patch-sf-*.mjs` — subflujos Supabase + mirror Sheets.

Requisitos: `N8N_API_URL` y `N8N_API_KEY` en `.env` local (no commitear).
