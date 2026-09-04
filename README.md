# Ruta DyS 📍🚗
> **Solución móvil inteligente de rutas comerciales, visitas en terreno y gestión de clientes.**
> Desarrollado para **Soluciones DyS**.

---

## 📖 Descripción General

**Ruta DyS** es una aplicación móvil diseñada específicamente para vendedores, repartidores y ejecutivos comerciales en terreno. Permite cargar y gestionar carteras de clientes, geocodificarlos automáticamente en el mapa, priorizar visitas mediante un **mapa de calor por semáforo**, planificar la ruta óptima diaria y registrar en tiempo real el **recorrido físico mediante tracking GPS** con cálculo de kilometraje real transitado.

---

## ✨ Características Principales

### 1. 👥 Gestión y Carga de Clientes
- **Carga Manual Rápida**: Registro de clientes con Nombre, RUT y Dirección.
- **Validación y Formateo de RUT Chileno**: Validación flexible de formato y limpieza automática (`12345678-9`).
- **Importación Masiva desde CSV**: Carga cientos de clientes desde archivos Excel/CSV con detección automática de columnas (`nombre`, `rut`, `direccion`, y opcionalmente `ultima_visita`).
- **Control de Duplicados**: Detección automática para evitar registros repetidos por RUT.

### 2. 📍 Geocodificación y Corrección Interactiva
- **Geocodificación con OpenStreetMap (Nominatim)**: Obtención de coordenadas geográficas en segundo plano con control de cuotas para evitar bloqueos.
- **Fallback a Nivel de Comuna**: Si una dirección rural o compleja no se encuentra exacta, se aproxima a la comuna para que el vendedor siempre tenga una referencia visual.
- **Ajuste Manual en el Mapa**: Arrastra el pin azul o toca la pantalla para ubicar con precisión milimétrica la entrada del local o bodega del cliente.

### 3. 🌡️ Mapa de Calor y Priorización de Visitas
Clasificación visual automática basada en el tiempo transcurrido desde la última visita:
- 🔴 **Rojo (Prioridad Alta / Urgente)**: Más de 30 días sin visita o clientes nuevos sin historial registrado.
- 🟡 **Amarillo (Prioridad Media / Alerta)**: Entre 15 y 30 días sin visita.
- 🟢 **Verde (Al día / Reciente)**: Menos de 15 días desde la última visita.
- **Barra de Filtros Rápida**: Filtra en el mapa con un solo toque para ver solo los clientes urgentes o en alerta.
- **Actualización en Tiempo Real**: Al marcar un cliente como visitado, su pin cambia a verde al instante.

### 4. 🚗 Tracking GPS en Vivo y Kilometraje Real (Migas de Pan)
- **Trazado de Línea Azul en Tiempo Real**: Conforme el vendedor se mueve físicamente de un punto A a un punto B, la app dibuja la trayectoria real por las calles recorridas.
- **Filtro Antideriva Inteligente**: Ignora saltos pequeños por imprecisión del GPS cuando el usuario está quieto dentro de un local o en un semáforo (requiere al menos 12 m de desplazamiento real).
- **Cálculo de Kilómetros Reales**: Suma acumulativa de la distancia efectivamente recorrida en la jornada.
- **Controles de Jornada**: Botones para pausar, reanudar o reiniciar el contador y la trayectoria del día.
- **Persistencia Diaria**: El trayecto queda guardado en el teléfono aunque se cierre o minimice la aplicación.

### 5. 🧭 Ruta del Día y Navegación Externa
- **Optimización de Paradas**: Algoritmo de vecino más cercano (*Nearest Neighbor*) que ordena las visitas según la proximidad geográfica desde la posición actual del vendedor.
- **Integración con Waze y Google Maps**: Botón directo `🧭 Ir` para abrir la navegación paso a paso con un solo toque en tu app de mapas preferida.
- **Registro de Visitas**: Botón `✓ Visité` que guarda la hora exacta de visita y retira al cliente de la lista de pendientes (con opción de `Deshacer`).

### 6. 📡 Funcionamiento Con y Sin Conexión
- Verificación automática de conectividad con `@react-native-community/netinfo`.
- Persistencia local completa mediante `AsyncStorage`.

---

## 🏗️ Arquitectura y Estructura del Proyecto

El proyecto está construido con **Expo SDK 54**, **React Native 0.81**, **React 19** y **Expo Router v6**:

```text
rutario-app/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Configuración de las pestañas (Clientes, Mapa, Ruta)
│   │   ├── explore.tsx      # Pantalla Mapa (Polyline en vivo, semáforo y filtros)
│   │   ├── index.tsx        # Pantalla Clientes (Lista, formulario y CSV)
│   │   └── ruta.tsx         # Pantalla Ruta del Día (Secuencia y registro de visitas)
│   └── _layout.tsx          # Root Layout con ClientesProvider y temas
├── assets/
│   └── images/              # Iconos oficiales de Ruta DyS y splash screen
├── components/
│   ├── ui/
│   │   ├── icon-symbol.ios.tsx
│   │   └── icon-symbol.tsx  # Iconografía multiplataforma (SF Symbols / MaterialIcons)
│   ├── ClienteTarjeta.tsx   # Tarjeta de cliente con badge de prioridad y edición rápida
│   └── haptic-tab.tsx       # Respuesta háptica en pestañas
├── constants/
│   └── theme.ts             # Paleta de colores y constantes de diseño
├── context/
│   └── ClientesContext.tsx  # Estado global reactivo, tracking GPS y visitas
├── hooks/
│   ├── use-color-scheme.ts
│   ├── use-color-scheme.web.ts
│   └── use-network-status.ts
├── services/
│   ├── csv.ts               # Parser de archivos CSV con fechas de visita
│   ├── geocoding.ts         # Geocodificación con Nominatim y manejo de fallbacks
│   ├── prioridad.ts         # Motor de cálculo de semáforo de calor (🔴, 🟡, 🟢)
│   └── rut.ts               # Utilidades de formato y validación de RUT
├── types/
│   └── cliente.ts           # Definiciones de TypeScript (Cliente, PuntoGPS, etc.)
├── app.json                 # Configuración de la app, permisos y metadatos de Expo
├── eas.json                 # Perfiles de compilación para generar APKs en la nube
└── package.json             # Dependencias del proyecto
```

---

## 🚀 Instalación y Puesta en Marcha

### Prerrequisitos
- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada).
- [Git](https://git-scm.com/).
- Dispositivo Android con Expo Go o emulador.

### 1. Clonar e Instalar Dependencias
```bash
git clone <url-del-repositorio>
cd rutario-app
npm install
```

### 2. Iniciar el Servidor de Desarrollo
```bash
npx expo start -c
```

### 3. Abrir en tu Dispositivo
- **Android**: Escanea el código QR desde la aplicación **Expo Go**.
- **Web**: Presiona `w` en la consola para abrir en el navegador.

---

## 📦 Compilación y Generación de APK (EAS Build)

La aplicación está configurada para compilarse como un archivo instalable (**APK independiente**) a través de Expo Application Services (EAS):

```bash
# Iniciar sesión en Expo (si no lo has hecho)
npx eas-cli login

# Compilar APK para Android
npx eas-cli build -p android --profile preview
```

Al finalizar la compilación, EAS te proporcionará un enlace directo de descarga y un código QR para instalar la aplicación en cualquier teléfono Android sin necesidad de Expo Go.

---

## 📄 Formato del Archivo CSV para Importación

Para importar clientes de forma masiva, el archivo `.csv` debe incluir las siguientes columnas en su primera fila (separadas por coma):

```csv
nombre,rut,direccion,ultima_visita
Almacén Central,76.123.456-7,Av. Diego Portales 1234 Puerto Montt,2026-08-01
Comercial del Sur,15.654.321-K,San Martín 450 Puerto Varas,2026-08-22
Minimarket Nuevo,77.987.654-3,Los Carrera 890 Osorno,
```

> **Nota:** La columna `ultima_visita` es opcional (formato `YYYY-MM-DD`). Si se deja vacía o no existe, el cliente se catalogará como nuevo con prioridad **🔴 Urgente (>30 días)**.

---

## 🏢 Créditos y Propiedad

- **Empresa:** Soluciones DyS
- **Aplicación:** Ruta DyS
- **Desarrollo:** React Native + Expo
