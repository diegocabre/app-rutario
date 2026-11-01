# Spec: panel-gestion

Módulo de [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Estado: **borrador, falta tu aprobación**. Depende de `sync-app` (construido).

## Objetivo
El admin ve en el panel dónde están sus clientes, por dónde anduvo cada vendedor y cuánto trabajó cada uno, por día y por semana. En plan demo el reporte es parcial, para que la empresa vea el valor antes de pagar. El historial de un vendedor se conserva aunque se desvincule.

## Criterios de aceptación

### 1. Conservar el historial
- **Desvincular deja de borrar.** El vendedor queda **inactivo** (la columna `activo` ya existe), sus clientes quedan sin asignar, y sus visitas y km siguen en la base, con su nombre.
- **El teléfono lo detecta igual** que hoy y vuelve a demo, porque un miembro inactivo ya no ve su empresa.
- **Límite del plan demo:** cuenta solo vendedores activos.
- **Vendedores:** la página muestra solo los activos. Los reportes muestran a todos, y a los inactivos con la marca «desvinculado».

### 2. Mapa (`/panel/mapa`)
- Clientes con ubicación como puntos, con un color por vendedor. Los que no tienen vendedor van en gris.
- Al elegir un vendedor y un día se dibuja su recorrido (los puntos que sube la app) y se marcan los clientes que visitó.
- Leyenda con cada vendedor y sus km de ese día.

### 3. Reportes (`/panel/reportes`)
- **Por día:** tabla por vendedor con visitas, km y clientes visitados (nombre y hora).
- **Por semana (lunes a domingo):** visitas y km por vendedor y por día, con totales.
- Se cambia de día o de semana con flechas, y la tabla se puede **descargar en CSV**.
- **Plan demo, parcial:**
  - Solo se ven **hoy y la semana actual**.
  - Las semanas anteriores aparecen bloqueadas, con el aviso «Disponible en plan pagado».
  - El CSV no se puede descargar.

## Decisiones técnicas
- **Mapa: Leaflet con OpenStreetMap.**
  - Gratis y sin clave, así que no queda ninguna clave expuesta en el navegador.
  - Necesita la dependencia `leaflet`, unos 40 kB y solo en la página del mapa.
  - Hay que agregar al CSP `img-src https://tile.openstreetmap.org`, para que el navegador pueda cargar las imágenes del mapa.
  - Sigue la regla del panel: el navegador recibe los datos ya preparados por el servidor y nunca habla con Supabase.
- **Reportes:** se calculan en la base con una función `reporte_visitas(desde, hasta)`. El límite demo se aplica **en la base**: en demo, la función recorta las fechas a la semana actual. Así no se puede saltar desde el navegador.
- **Hora:** todo en hora de Chile (America/Santiago), igual que el resumen de hoy.

## Pruebas
- **pgTAP:**
  - desvincular conserva visitas y km, y deja los clientes sin asignar;
  - el límite demo cuenta solo vendedores activos;
  - `reporte_visitas` recorta las fechas en demo y no en pagado.
- **Playwright, en desktop y móvil:**
  - el mapa carga con clientes y recorrido;
  - el reporte del día y el de la semana muestran los totales;
  - en demo, las semanas anteriores aparecen bloqueadas y no se puede descargar el CSV.

## Límites
- **Siempre:** los límites del plan se aplican en la base, no solo en la pantalla.
- **Preguntar antes:** agregar `leaflet` y cambiar el CSP; subir la migración a la nube.
- **Nunca:** exponer claves en el navegador ni mandar ubicaciones de vendedores fuera del panel de su empresa.

## Preguntas abiertas
1. **¿Te parece bien Leaflet con OpenStreetMap para el mapa del panel?** La alternativa es Google Maps, que se ve igual que en la app, pero necesita una clave visible en el navegador y puede tener costo.
2. **¿El parcial de demo como lo propongo?** Hoy y la semana actual completas; lo anterior bloqueado y sin CSV.
3. **¿Cuánto tiempo guardamos los recorridos?** Recomiendo **90 días** de puntos GPS: es dato de ubicación de personas y la Ley 21.719 pide no guardarlo más de lo necesario. Los km y visitas se guardan siempre.
