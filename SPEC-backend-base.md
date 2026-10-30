# Spec: backend-base

Módulo de [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Estado: **borrador para aprobar**.

## Objetivo
Una base de datos Supabase compartida por el panel y la app, donde **cada empresa solo ve sus datos**, el **vendedor solo ve los clientes que tiene asignados**, y el **plan demo no puede pasar de 2 clientes**, aunque alguien llame a la API directamente.

## Modelo de datos (Postgres)
| Tabla | Campos principales |
|---|---|
| `organizaciones` | `id`, `nombre`, `plan` (`demo` \| `pagado`, por defecto `demo`), `creada_en` |
| `miembros` | `user_id` (→ `auth.users`, **único**: un usuario = una empresa), `organizacion_id`, `rol` (`admin` \| `vendedor`), `nombre`, `activo` |
| `superadmins` | `user_id` (tú) |
| `invitaciones` | `id`, `organizacion_id`, `nombre_vendedor`, `token_hash`, `vence_en`, `usada_en`, `usada_por` |
| `clientes` | `id`, `organizacion_id`, `vendedor_id` (asignado, puede ser nulo), `nombre`, `rut`, `direccion`, `lat`, `lng`, `geo_status`, `ultima_visita`, `actualizado_en` |
| `visitas` | `id`, `organizacion_id`, `cliente_id`, `vendedor_id`, `visitada_en` (timestamptz), `ultima_visita_anterior` |
| `recorridos` | `organizacion_id`, `vendedor_id`, `fecha` (date, local de Chile), `km`, `puntos` (jsonb); único por (`vendedor_id`, `fecha`) |

Los campos de `clientes` son los del tipo `Cliente` actual de la app, para que `sync-app` sea un mapeo directo.

## Reglas de acceso (RLS)
- **Admin**: lee y escribe todo lo de su organización.
- **Vendedor**: lee los clientes asignados a él; **solo puede actualizar** `lat`, `lng`, `direccion`, `geo_status` y `ultima_visita` de esos clientes; inserta visitas y recorridos propios.
- **Superadmin**: lee todas las organizaciones y puede cambiar `plan`.
- **Nadie** lee datos de otra organización.

## Lógica en la base de datos
- **Límite demo:** un trigger en `clientes` rechaza el 3.er cliente si `plan = 'demo'`.
- **Canje del QR:** la función `canjear_invitacion(token)` valida que el token exista, no esté usado ni vencido y que el usuario no pertenezca ya a otra empresa; entonces crea el `miembro` con rol `vendedor` y marca la invitación como usada. El token viaja en el QR y solo se guarda su hash.
- **Autenticación:** los admins entran con correo y contraseña. El vendedor no crea cuenta: la app hace un *anonymous sign-in* de Supabase y canjea el QR con esa sesión.

## Stack y ubicación
- Supabase (proyecto en la nube, región São Paulo por cercanía) + Supabase CLI con Docker para desarrollo local (Docker 29.8 ya está instalado).
- Repo nuevo **`E:\APP\rutario\rutario-panel`**, con `supabase/migrations/*.sql` y `supabase/tests/*.sql`. El panel Next.js se crea en ese mismo repo en `panel-auth`.

## Comandos
```
Local:        npx supabase start
Migraciones:  npx supabase migration new <nombre>
Reset local:  npx supabase db reset
Tests:        npx supabase test db
Subir:        npx supabase db push      (solo con tu aprobación)
Tipos TS:     npx supabase gen types typescript --local > types/database.ts
```

## Estilo
Tablas y columnas en español y snake_case, como el resto del proyecto. Cada regla RLS lleva un comentario de una línea.
```sql
-- El vendedor solo ve los clientes que tiene asignados
create policy "vendedor lee sus clientes" on clientes for select
  using (vendedor_id = auth.uid());
```

## Pruebas
pgTAP con `npx supabase test db`, al menos estos casos:
1. Un admin de la empresa A no ve clientes de la empresa B.
2. Un vendedor no ve clientes no asignados ni puede cambiar su `nombre` o `rut`.
3. Una empresa demo no puede insertar un 3.er cliente; una pagada sí.
4. Un token vencido, usado o inexistente no vincula; un usuario ya vinculado no puede canjear otro.

## Límites
- **Siempre:** cada cambio de esquema es una migración nueva; las pruebas pasan antes de cada commit.
- **Preguntar antes:** `supabase db push` al proyecto en la nube, y cualquier cambio de esquema después de que haya datos reales.
- **Nunca:** poner la `service_role` key en la app o en el navegador; subir el archivo `.env` al repo; desactivar RLS en una tabla.

## Lo que necesito de ti
1. **Crear el proyecto en supabase.com** (yo no puedo crear cuentas). Para desarrollar alcanza con Supabase local; el proyecto en la nube se necesita antes de `vinculacion-qr`.
2. **Darme acceso a la carpeta** `E:\APP\rutario` para crear `rutario-panel` (hoy solo tengo acceso a `rutario-app`).
3. **Crear el repo en GitHub** `rutario-panel`, o confirmar que lo cree yo con `gh`.

El hosting ya está resuelto: en `panel-auth` el repo se conecta a un proyecto nuevo de Vercel (equipo Soluciones DyS Spa) con el dominio `rutario.solucionesdys.cl`. Como el dominio ya usa los DNS de Vercel, no hay que configurar DNS.
