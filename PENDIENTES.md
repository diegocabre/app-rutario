# Ruta DyS: resumen y pendientes (30-10-2026)

## ✅ Lo que ya está hecho

**Base de datos (Supabase, proyecto `fvbabpruitngkyxhzgrw`)**
- Tablas de empresas, vendedores, clientes, visitas y recorridos, y cada empresa ve solo lo suyo.
- Plan demo: **2 clientes** y **1 vendedor**, y esos límites los aplica la base de datos.
- QR de vinculación: sirve una vez y vence en 24 h.
- Pasan 40 pruebas automáticas.
- En la nube: tablas, reglas y función de superadmin aplicadas. El ingreso anónimo lo activaste tú.

**Panel web (`rutario-panel`)**
- Portada, descarga (por ahora dice «muy pronto»), registro con confirmación por correo, login y panel con el plan.
- **Vendedores**: crear QR, ver invitaciones pendientes, revocar y desvincular.
- **Superadmin** (`/superadmin`): ves todas las empresas y activas el plan pagado.
- **Privacidad** y **Términos**, según la Ley 19.628 y la Ley 21.719. Solo usa cookies de sesión, sin banner.
- **Seguridad:** el navegador nunca ve claves de Supabase, las contraseñas tienen mínimo 10 caracteres con mayúsculas, minúsculas y números, y el sitio envía cabeceras de seguridad.
- Pasan 12 pruebas en navegador (desktop y móvil).
- Favicon e ícono de Apple.

**App (`rutario-app`)**
- Modo demo con 2 clientes, importación de clientes, ubicación en terreno, edición de direcciones y exportación a CSV.
- Botón **Vincular con mi empresa**: escanea el QR (o se pega el enlace) y la app queda vinculada.
- Si la empresa la desvincula, la app vuelve a demo y borra los datos de la empresa.
- Íconos nuevos: app, Android adaptable, splash y favicon.

## ⏳ Lo que falta, en orden

### 1. Supabase: 2 comandos (en el PC, carpeta `E:\APP\rutario\rutario-panel`)
```bash
npx supabase@2.122.0 db push --linked
npx supabase@2.122.0 config push --yes
```
- El primero sube el límite de 1 vendedor en demo.
- El segundo configura la URL del sitio, los enlaces de confirmación y las contraseñas de 10 caracteres.

### 2. Publicar el panel en Vercel (se puede desde el celular)
1. Entra a vercel.com y abre Add New → Project.
2. Importa `diegocabre/rutario-panel`, en el equipo Soluciones DyS.
3. Agrega estas variables de entorno:
   - `SUPABASE_URL` = `https://fvbabpruitngkyxhzgrw.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` = la *Publishable key*, en Supabase → Project Settings → API Keys. **No uses la secret.**
   - `SITE_URL` = `https://rutario.solucionesdys.cl`
4. Toca Deploy.
5. En Settings → Domains, agrega `rutario.solucionesdys.cl`. No hay que tocar DNS.

### 3. Probar el correo de registro
- Regístrate en `rutario.solucionesdys.cl/registro` con un correo **que no sea del equipo de Supabase**.
- Si no llega el correo, hay que conectar un SMTP: crea una cuenta en Resend, verifica `solucionesdys.cl` y pon sus datos en Supabase → Authentication → SMTP Settings.

### 4. Hacerte superadmin
1. Regístrate en el panel con tu correo.
2. Ve a Supabase → SQL Editor y corre esto con tu correo:
```sql
insert into public.superadmins select id from auth.users where email = 'TU_CORREO';
```

### 5. APK para descargar (lo armamos juntos en el PC)
- Inicia sesión en EAS con `npx eas-cli login`.
- Hay que cargar en EAS las variables de la app (`EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) y construir el APK.
- Después se publica en `rutario.solucionesdys.cl/descargar`.

### 6. Revisar
- **Textos legales:** son un borrador; revísalos con un abogado. Confirma el plazo de **90 días** para borrar los datos al cerrar una cuenta.
- **Repo `rutario-panel`:** pásalo a **privado** en GitHub.

## Después del lanzamiento
- **Recuperar contraseña** en el panel.
- **Captura real de la app** en la portada.
- **`sync-app`:** la app vinculada baja sus clientes asignados y sube visitas y km.
- **`panel-gestion`:** mapa, importar clientes, asignarlos y reportes.
