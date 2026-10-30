# Mapa de capacidades: Ruta DyS como producto (panel + app)

Estado: **aprobado en lo general** (backend Supabase, cobro manual, el admin asigna clientes, un vendedor = una empresa). Los specs de cada módulo se aprueban por separado antes de programarlos.

## La idea en una frase
Una empresa usa el **panel administrador** (web, Next.js). Desde el panel crea a sus vendedores y a cada uno le muestra un **QR único**. El vendedor descarga la app (desde rutario.solucionesdys.cl), escanea ese QR y su app queda **vinculada** a la empresa. El **administrador asigna los clientes** a cada vendedor, y las visitas y kilómetros de cada uno se ven en el panel.

## Planes
- **Demo** (toda empresa parte así): el panel permite **2 clientes en total**, y los reportes se ven **parcialmente y sin poder editarlos**, para invitar a pagar.
- **Pagado**: sin límite de clientes y reportes completos. **Tú lo activas a mano** (superadmin) cuando la empresa te paga.
- **App sin vincular**: funciona en modo local con **2 clientes** como máximo, para probarla antes de tener panel.

## Decisiones
1. Cliente que paga = **empresa** (organización), con 1 o más administradores y N vendedores.
2. **El QR lo muestra el panel y lo escanea la app.** Es de un solo uso, vence y queda asociado a un vendedor.
3. **Un vendedor pertenece a una sola empresa.**
4. **El administrador asigna los clientes**; el vendedor los ve, los visita y puede corregir su ubicación y dirección en terreno.
5. **Tú eres superadmin**: ves todas las empresas y cambias su plan de demo a pagado.
6. **Backend: Supabase** (Postgres + Auth + Row Level Security). Los límites del plan demo se aplican **en la base de datos**, no solo en la pantalla, para que no se puedan saltar.
7. **La app sigue funcionando sin señal** y sincroniza cuando hay conexión.
8. **El panel y la base de datos viven en un repo aparte**: `E:\APP\rutario\rutario-panel` (Next.js + carpeta `supabase/` con las migraciones).
9. **Dominio: `rutario.solucionesdys.cl`**, igual que `reservas.solucionesdys.cl`. Proyecto nuevo `rutario-panel` en Vercel (equipo Soluciones DyS Spa). Como `solucionesdys.cl` ya usa los DNS de Vercel, el subdominio se configura solo, sin tocar DNS. En ese sitio quedan la portada, la descarga de la app y el login del panel.
10. **Distribución Android**: APK descargable desde `rutario.solucionesdys.cl`. iPhone no permite instalar apps fuera del App Store, así que iOS queda para cuando se publique en la tienda.

## Módulos

| Módulo (id) | Qué hace | Depende de |
|---|---|---|
| `demo-app` | App sin vincular: máximo 2 clientes (agregar e importar), aviso de demo con enlace a `rutario.solucionesdys.cl` | — |
| `backend-base` | Proyecto Supabase: tablas, reglas RLS por empresa y rol, límite de 2 clientes en plan demo, función para canjear el QR | — |
| `panel-auth` | Sitio en `rutario.solucionesdys.cl` (Vercel): login de administradores, alta de empresa (parte en demo), vista de superadmin para cambiar planes | `backend-base` |
| `vinculacion-qr` | Panel crea vendedor y genera QR → la app lo escanea (expo-camera) y queda vinculada; desvincular desde el panel | `backend-base`, `panel-auth` |
| `sync-app` | La app vinculada baja los clientes asignados y sube ubicaciones, visitas y km; funciona sin señal | `vinculacion-qr` |
| `panel-gestion` | Panel: vendedores, mapa, importar CSV, asignar clientes, reportes de visitas y km (parciales en demo) | `sync-app` |
| `distribucion` | Build del APK con EAS y página de descarga en `rutario.solucionesdys.cl/descargar` | `demo-app` |
| `facturacion` | Cobro automático (más adelante; por ahora manual) | `panel-auth` |

## Avance
- ✅ `demo-app` (repo app-rutario)
- ✅ `backend-base` (repo rutario-panel: migración + 31 pruebas pgTAP, solo en local)
- ✅ `panel-auth` (repo rutario-panel: Next.js 16, 10 E2E desktop+móvil, 34 pruebas pgTAP; falta publicar en Vercel)

## Orden de construcción
- **En paralelo:** `demo-app` y `backend-base` (no dependen entre sí).
- Luego: `panel-auth` → `vinculacion-qr` → `sync-app` → `panel-gestion`.
- `distribucion` cuando `demo-app` esté listo; `facturacion` al final.

## Riesgos
- **Rastreo GPS de trabajadores:** en Chile hay que informar y pedir consentimiento; el panel debe mostrar solo la jornada.
- **Tiendas de apps:** desbloquear funciones pagadas fuera de la tienda tiene reglas; el modelo "servicio para empresas" suele estar permitido, pero hay que confirmarlo antes de publicar en las tiendas.
- **APK fuera de Play Store:** Android pide permitir "orígenes desconocidos", y el APK debe firmarse siempre con la misma llave para que las actualizaciones instalen sobre la versión anterior.
