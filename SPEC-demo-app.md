# Spec: demo-app

Módulo de [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Estado: **borrador para aprobar**.

## Objetivo
Quien descarga la app desde rutario.solucionesdys.cl y **no la ha vinculado** a una empresa puede probarla con **2 clientes como máximo**. La app le explica que es una demo y cómo obtener la versión completa.

## Criterios de aceptación
1. Sin vincular, agregar un 3.er cliente muestra el aviso *"Versión demo: máximo 2 clientes"* con un botón que abre `https://rutario.solucionesdys.cl`, y no guarda el cliente. (Mientras ese sitio no exista, el enlace lleva a una página que aún no está publicada; se publica en `panel-auth`.)
2. Al importar un CSV sin vincular, se importan solo los cupos que quedan (0, 1 o 2), y el resumen dice cuántos quedaron fuera por el límite.
3. Un banner en la lista de clientes muestra **"Demo · N de 2 clientes"** mientras la app no esté vinculada.
4. Si ya hay más de 2 clientes (como en tu teléfono actual con 158), **no se borran**: solo se bloquea agregar o importar más.
5. Estado de vinculación guardado en AsyncStorage (`vinculada`, `false` por defecto). Por ahora nada lo pone en `true`; lo hará `vinculacion-qr`.
6. Las demás funciones (mapa, ruta, «Estoy aquí», reporte por correo) siguen igual en demo.

## Stack
La app actual: Expo SDK 54, Expo Router, AsyncStorage. **Sin dependencias nuevas.**

## Comandos
```
Dev:        npx expo start
Lint:       npx expo lint
Typecheck:  npx tsc --noEmit
Tests:      node --test services/*.test.ts   (Node 24 ejecuta TypeScript sin compilar)
```

## Estructura
- `services/demo.ts`: constante `LIMITE_DEMO = 2` y función pura `cuposDisponibles(totalClientes, vinculada)`, sin imports con alias para poder probarla con `node --test`.
- `services/demo.test.ts`: pruebas de esa función.
- `context/ClientesContext.tsx`: carga `vinculada`, aplica el límite en `agregarCliente` e `importarCSV`.
- `app/(tabs)/index.tsx`: banner de demo.

## Estilo
El del proyecto: nombres en español, funciones flecha dentro del provider, `Alert.alert` para avisos.
```ts
export const LIMITE_DEMO = 2;

export function cuposDisponibles(total: number, vinculada: boolean): number {
  return vinculada ? Infinity : Math.max(0, LIMITE_DEMO - total);
}
```

## Pruebas
- Unitarias de `cuposDisponibles` (0, 1, 2 y 158 clientes; vinculada y sin vincular).
- Manual en Expo Go: agregar 3 clientes, importar `clientes_customer.csv` en una app vacía (deben entrar 2) y revisar el banner.

## Límites
- **Siempre:** lint y typecheck antes de cada commit; el límite se valida en el contexto, no solo en la pantalla.
- **Preguntar antes:** agregar dependencias o cambiar el formato de lo guardado en AsyncStorage.
- **Nunca:** borrar clientes existentes para cumplir el límite.

## Preguntas abiertas
1. **Tu teléfono queda en demo** hasta que exista la vinculación: conservas tus 158 clientes, pero no podrás agregar ni importar más. ¿Te sirve así, o prefieres que `vinculada` parta en `true` en tu teléfono mientras tanto?
2. ~~¿A qué página lleva el aviso?~~ Resuelto: `https://rutario.solucionesdys.cl`.
