# Spec: sync-app

Módulo de [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Estado: **aprobado y construido el 01-11** (falta subir la migración a la nube y publicar APK 1.1.0). Pendiente menor: el gesto de arrastrar para recargar se reemplazó por tocar la línea «Vinculada a…». Depende de `vinculacion-qr` (listo).

## Objetivo
Un teléfono vinculado trabaja con los clientes que la empresa le asignó en el panel. Registra visitas y km aunque no tenga señal, y los sube cuando vuelve la conexión. Así el admin ve en el panel el avance real de cada vendedor. Esto es lo que hace útil el plan pagado.

## Criterios de aceptación
1. **Bajar clientes.** Al vincularse, al abrir la app con internet y con el gesto de arrastrar hacia abajo para recargar, la app reemplaza su lista local por los clientes que la empresa le asignó (la tabla `clientes` permite que cada vendedor lea solo los suyos). Los clientes de demo que había en el teléfono se borran al vincular, porque eran de prueba.
2. **Sin señal.** La app funciona igual que hoy con la última lista bajada: mapa, ruta del día, visitas y km.
3. **Subir visitas.** Cada visita se guarda en el teléfono con un `id` UUID generado en la app y queda en una **cola**. Al haber conexión se sube con `insert … on conflict (id) do nothing`, así que reintentar nunca la duplica. Deshacer una visita la borra en el servidor si ya había subido, y la quita de la cola si no.
4. **Subir ubicación del cliente.** Si el vendedor ubica o corrige un cliente en terreno, se suben `lat`, `lng`, `direccion` y `geo_status`. La base ya le impide al vendedor cambiar el nombre, el RUT o la asignación.
5. **Subir km.** Se hace un upsert del recorrido del día (`recorridos`, clave vendedor + fecha), con los km y los puntos simplificados, al terminar la jornada y cada 15 minutos con señal.
6. **Indicador.** En la pantalla principal se ve «Sincronizado hace X min» o «N pendientes por subir».
7. **Desvinculado.** Si la base responde que el teléfono ya no es miembro de la empresa, se aplica el flujo actual (vuelve a demo y borra los datos). La cola pendiente se descarta, porque esos datos son de la empresa.
8. **En el panel** (mínimo, para comprobarlo): en **Vendedores**, cada vinculado muestra «Visitas hoy: N · Km hoy: X». El mapa y los reportes completos son parte de `panel-gestion`.

## Decisiones técnicas
- **Sin dependencias nuevas:** se usan `supabase-js` (ya instalado), AsyncStorage para la cola y `useNetworkStatus` (ya existe) para detectar cuándo volver a intentar.
- **Toda la lógica de sincronización en `services/sync.ts`.** Son funciones puras para armar la cola y combinar listas, y se prueban con `node --test`. `ClientesContext` solo las llama.
- **Conflictos:** en clientes manda el servidor, salvo la ubicación que el vendedor aún no ha subido. En visitas y recorridos no hay conflicto, porque solo los escribe el vendedor.
- **Migración pequeña:** función `resumen_vendedores_hoy()`, que entrega las visitas y km de hoy por vendedor, para el panel. Lleva pruebas pgTAP.

## Pruebas
- **App (node:test):** armar y vaciar la cola, no duplicar visitas al reintentar, y combinar la lista del servidor con las ubicaciones locales pendientes.
- **Base (pgTAP):** que el vendedor suba una visita de un cliente suyo y no de uno ajeno, que el upsert de recorrido funcione y que `resumen_vendedores_hoy` sea solo para el admin.
- **Flujo completo:** un script con sesión anónima contra Supabase local que se vincula, baja clientes, sube una visita dos veces (queda una) y sube km, y luego revisa el panel con Playwright.

## Límites
- **Siempre:** cada cambio queda en la cola antes de intentar subirlo, para que nunca se pierda una visita hecha sin señal.
- **Preguntar antes:** subir la migración a la nube y publicar un APK nuevo.
- **Nunca:** subir datos de una app en demo, ni usar la secret key.

## Decisiones (01-11)
1. **Los clientes los carga el admin** en el panel, nueva página **Clientes**:
   - Importa un CSV con el mismo formato que exporta la app (nombre, rut, dirección y, si vienen, coordenadas y última visita).
   - Elige a qué vendedor asignarlo y puede reasignar cliente por cliente.
   - El mapa y los reportes quedan para `panel-gestion`.
2. **El vendedor no crea clientes, pero sí prospectos.** En modo vinculado, «+ Agregar Cliente» pasa a ser «+ Agregar prospecto»:
   - Usa los mismos campos (nombre, RUT y dirección) y, si hay GPS, la ubicación actual.
   - El prospecto entra a la cola y sube a la tabla nueva `prospectos`.
   - En el panel, el admin lo **convierte en cliente** (asignado a ese vendedor) o lo **descarta**.
   - «Importar CSV» se oculta en modo vinculado.
3. **Km:** se suben cada 15 min con señal y al cerrar la jornada.

Además, para que **última visita** quede bien en el panel, la base la actualiza sola con un trigger cuando se sube o se deshace una visita.
