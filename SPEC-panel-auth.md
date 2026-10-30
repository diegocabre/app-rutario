# Spec: panel-auth

Módulo de [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Estado: **aprobado y construido** en `rutario-panel`; falta publicarlo en Vercel.

## Objetivo
Publicar `rutario.solucionesdys.cl` con la portada del producto, el registro de empresas (que parten en plan demo), el login de administradores y una vista de superadmin donde tú pasas empresas a "pagado".

## Criterios de aceptación
1. `/` portada: qué es Ruta DyS, botón **Probar gratis** (registro) y **Descargar app** (Android).
2. `/descargar`: enlace al APK (por ahora "Muy pronto" hasta el módulo `distribucion`).
3. `/registro`: correo, contraseña, nombre de la empresa y del admin → llama `crear_organizacion` → entra al panel en plan **demo**.
4. `/login` y cierre de sesión; las rutas `/panel/*` exigen sesión de un miembro **admin**.
5. `/panel`: nombre de la empresa, insignia del plan (**Demo · 2 clientes máx.** o **Pagado**) y menú vacío para `panel-gestion`.
6. `/superadmin`: lista de empresas con su plan, cantidad de vendedores y clientes, y botón **Activar plan pagado / Volver a demo**. Solo visible si tu usuario está en `superadmins`.
7. Un vendedor (sesión anónima de la app) que intente entrar al panel ve "Esta cuenta es de la app móvil".

## Stack
- Next.js (App Router, TypeScript) con `npx create-next-app@latest` en el repo `rutario-panel`.
- `@supabase/ssr` + `@supabase/supabase-js` para la sesión en el servidor (cookies).
- Tipos generados con `npx supabase gen types typescript`.
- Hosting: proyecto nuevo **rutario-panel** en Vercel (equipo Soluciones DyS Spa) con el dominio `rutario.solucionesdys.cl`.

## Comandos
```
Dev:     npm run dev
Build:   npm run build
Lint:    npm run lint
E2E:     npx playwright test            (desktop y móvil)
DB:      npx supabase@2.122.0 start / test db
```

## Estructura
```
app/(publico)/page.tsx, descargar/, registro/, login/
app/panel/            → protegido (admin)
app/superadmin/       → protegido (superadmin)
lib/supabase/         → clientes de servidor y navegador
supabase/             → migraciones y pruebas (ya existe)
e2e/                  → pruebas Playwright
```

## Diseño
Siguiendo tu flujo: dirección visual con `design-taste-frontend`, pulido con `/impeccable` y verificación con Playwright en desktop y móvil. Identidad de Soluciones DyS (necesito el logo y colores si tienes una guía; si no, los tomo de solucionesdys.cl).

## Pruebas
- Playwright: registro → panel en demo; login/logout; usuario no admin bloqueado; superadmin cambia el plan.
- Las reglas de la base ya están cubiertas por las 31 pruebas pgTAP de `backend-base`.

## Límites
- **Siempre:** las claves de Supabase en variables de entorno de Vercel; solo la `anon key` llega al navegador.
- **Preguntar antes:** crear el proyecto de Vercel y asignar el dominio; `supabase db push` a la nube.
- **Nunca:** usar la `service_role` key en el navegador; permitir que un admin cambie su propio plan.

## Lo que necesito de ti
1. ~~Proyecto en supabase.com~~ ✅ `fvbabpruitngkyxhzgrw` (https://fvbabpruitngkyxhzgrw.supabase.co).
2. **OK para crear el proyecto `rutario-panel` en Vercel** con el dominio `rutario.solucionesdys.cl` (no hay que tocar DNS).
3. **¿Confirmación por correo al registrarse?** Recomiendo sí, para evitar empresas falsas.
4. Logo y colores de Soluciones DyS, si los tienes a mano.
