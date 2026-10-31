# Ruta DyS: hecho y pendiente (31-10-2026)

## ✅ Lanzado

- **Panel:** en línea en https://rutario.solucionesdys.cl (Vercel, repo `rutario-panel` privado).
- **App Android:** APK 1.0.0 descargable en https://rutario.solucionesdys.cl/descargar (release v1.0.0 de `app-rutario`). Ya se instaló y probó en un teléfono.
- **Superadmin:** `desarrollador@solucionesdys.cl`.

**Base de datos (Supabase `fvbabpruitngkyxhzgrw`)**
- Cada empresa ve solo sus propios datos.
- El plan demo permite **2 clientes** y **1 vendedor**, y la base lo controla.
- El QR de vinculación sirve una vez y vence en 24 h.
- Ingreso anónimo activado para la app.
- Configuración de autenticación aplicada: URL del sitio y contraseñas de 10 caracteres.
- Pasan 40 pruebas automáticas.

**Panel web**
- Portada, registro con confirmación por correo (probado) y login.
- Panel con el plan de la empresa, y cabecera «Ruta DyS · empresa» con el logo de la app.
- **Vendedores:** crear QR, revocar invitaciones y desvincular.
- **Superadmin:** ver todas las empresas y cambiar el plan entre demo y pagado.
- **Descargar:** botón del APK. Siempre apunta al último release.
- Privacidad y Términos según las leyes 19.628 y 21.719. Solo usa cookies de sesión, por eso no lleva banner.
- **Seguridad:** el navegador nunca ve claves y el sitio envía cabeceras de seguridad. Pasan 12 pruebas en navegador.

**App**
- Modo demo con 2 clientes, importación desde CSV, ubicación, edición de direcciones y exportación.
- **Vincular con mi empresa:** se escanea o se pega el QR (probado en producción).
- Si la empresa la desvincula, la app vuelve a demo y borra los clientes.

## ⏳ Lo que falta

### Pronto (cosas tuyas, sin código)
1. **Clave de Google Maps:** en Google Cloud, restríngela a apps Android con el paquete `com.diegocabre.rutarioapp`. Hoy está a la vista en el repo público `app-rutario`.
2. **Textos legales:** son un borrador. Revísalos con un abogado y confirma el plazo de **90 días** para borrar los datos al cerrar una cuenta.
3. **Tu teléfono con 23 clientes:** son de una instalación anterior. Para dejarlo en 0:
   1. Desvincúlalo en el panel.
   2. Reabre la app con internet.
   3. Vuelve a vincularlo con un QR nuevo.
4. **(Opcional) DNS:** Vercel recomienda cambiar el registro A de `rutario` por el CNAME que muestra. El registro actual sigue funcionando.

### Próximos módulos (código)
1. **Recuperar contraseña** en el panel.
2. **`sync-app`:** la app vinculada baja sus clientes asignados y sube visitas y km. Es lo que hace útil el plan pagado.
3. **`panel-gestion`:** mapa, importación y asignación de clientes, y reportes (en demo, parciales).
4. **Facturación:** hoy el cobro es manual y el plan se cambia desde Superadmin.
5. **Captura real de la app** en la portada.

### Cómo publicar una versión nueva de la app
1. En `rutario-app`, construye el APK:
   ```bash
   npx eas-cli build --platform android --profile preview
   ```
2. Descarga el APK y súbelo como release nuevo:
   ```bash
   gh release create vX.Y.Z ruta-dys.apk --repo diegocabre/app-rutario
   ```
   El archivo debe llamarse `ruta-dys.apk`. Así `/descargar` toma la versión nueva sin tocar el panel.
