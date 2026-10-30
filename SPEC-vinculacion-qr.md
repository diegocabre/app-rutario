# Spec: vinculacion-qr

Módulo de [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Estado: **borrador para aprobar** (nada construido). Depende de `backend-base` y `panel-auth` (ambos listos).

## Objetivo
El administrador agrega un vendedor en el panel y le muestra un QR. El vendedor lo escanea con la app, que queda vinculada a la empresa: sin límite de demo en la app y lista para `sync-app`. El admin puede desvincularlo.

## Criterios de aceptación

### Panel (`rutario-panel`)
1. `/panel/vendedores` lista a los vendedores de la empresa (nombre, fecha de vinculación) y las invitaciones pendientes con su vencimiento.
2. **Agregar vendedor**: el admin escribe el nombre y el panel llama `crear_invitacion` y muestra el QR **una sola vez**. Al recargar la página ya no se ve, porque el token no se guarda.
3. El QR contiene `https://rutario.solucionesdys.cl/vincular?t=<token>`. Si se escanea con la cámara normal del teléfono, abre una página que explica cómo descargar la app.
4. **Revocar** una invitación pendiente y **desvincular** a un vendedor. Al desvincularlo, sus clientes quedan sin asignar, como ya lo hace la base.
5. Un vendedor (sesión anónima de la app) no puede ver ni crear invitaciones. Esto ya está cubierto por pgTAP.

### App (`rutario-app`)
6. Botón **Vincular con mi empresa** (en el aviso de demo) → pantalla con la cámara (`expo-camera`) que lee el QR. También acepta pegar el enlace, por si falla la cámara.
7. Al leer el QR, la app abre una sesión anónima en Supabase, llama `canjear_invitacion(token)` y guarda `vinculada = true` con el nombre de la empresa.
8. Errores claros: QR vencido o ya usado, sin conexión ("Necesitas internet para vincular") y vendedor ya vinculado a otra empresa.
9. Si el admin lo desvincula, la app lo detecta en la siguiente sincronización y vuelve a modo demo.

## Stack y decisiones
- **Panel:** el QR se genera **en el servidor** como SVG con el paquete `qrcode`. Así el token no pasa por JavaScript de terceros en el navegador. *Nueva dependencia: pide tu OK.*
- **App:** `@supabase/supabase-js` con la sesión guardada en AsyncStorage, más `expo-camera`; ambos se instalan con `npx expo install`, según la guía de Supabase de expo-examples para SDK 54. *Nuevas dependencias: piden tu OK.*
- **La app sí habla directo con Supabase** (a diferencia del panel), porque debe funcionar sin señal y sincronizar después. Usa solo la *publishable key*, que es pública por diseño, y las reglas RLS limitan lo que ve cada vendedor.
- Variables de la app: `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Comandos
```
Panel:  npm run dev · npx playwright test
App:    npx expo start · node --test services/*.test.ts
DB:     npx supabase@2.122.0 test db
```

## Pruebas
- **Panel (Playwright, desktop y móvil):** agregar vendedor muestra el QR y la invitación queda pendiente; revocar la elimina; al recargar no se vuelve a ver el QR.
- **App (node:test):** extraer el token del enlace del QR (enlace válido, otro dominio, sin token, texto suelto).
- **Flujo completo:** se canjea un token real contra Supabase local desde un script con sesión anónima, sin cámara.

## Límites
- **Siempre:** el token solo existe en el QR; en la base se guarda únicamente su hash.
- **Preguntar antes:** agregar dependencias; activar el ingreso anónimo en la nube (te toca a ti en el dashboard, o con tu OK lo hago yo).
- **Nunca:** poner la *secret key* en la app; mostrar el token en logs.

## Preguntas abiertas
1. **¿Cuántos vendedores en plan demo?** Recomiendo **1**, para que prueben la vinculación sin regalar el producto. Hoy la base no limita vendedores; sería un trigger más, como `limite_demo`.
2. **Al desvincular, ¿qué pasa con los clientes guardados en el teléfono?** Recomiendo **borrarlos del teléfono**, porque son datos de la empresa (privacidad), y dejar la app en demo vacía.
3. **Ingreso anónimo en la nube:** ¿ya lo activaste (Authentication → Sign In / Providers → Allow anonymous sign-ins)?
