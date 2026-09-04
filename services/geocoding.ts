import NetInfo from "@react-native-community/netinfo";

export interface Coordenadas {
  lat: number;
  lng: number;
}

export type ResultadoGeocodificacion =
  | { status: "ok"; coords: Coordenadas }
  | { status: "aproximado"; coords: Coordenadas }
  | { status: "no_encontrado" }
  | { status: "sin_conexion" };

// Viewbox que cubre aproximadamente la región de Los Lagos (Puerto Montt,
// Puerto Varas, Osorno, Calbuco, Alerce). Esto no EXCLUYE resultados de
// otras zonas, solo les da prioridad a los de esta región cuando hay ambigüedad.
const VIEWBOX_LOS_LAGOS = "-73.5,-40.3,-72.0,-41.8";

async function buscarEnNominatim(query: string): Promise<Coordenadas | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
    `&format=json&limit=1&countrycodes=cl&viewbox=${VIEWBOX_LOS_LAGOS}&bounded=0`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "RutarioApp/1.0 (rutario-app-expo)" },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.warn("Fallo al consultar Nominatim:", err);
  }
  return null;
}

// Intenta extraer la comuna/ciudad de una dirección larga, buscando
// coincidencia con las comunas conocidas de la zona. Sirve como último
// recurso para al menos centrar el mapa cerca del lugar correcto.
const COMUNAS_CONOCIDAS = [
  "PUERTO MONTT",
  "PUERTO VARAS",
  "OSORNO",
  "CALBUCO",
  "ALERCE",
  "FRUTILLAR",
  "LLANQUIHUE",
];

function extraerComuna(direccion: string): string | null {
  const direccionUpper = direccion.toUpperCase();
  for (const comuna of COMUNAS_CONOCIDAS) {
    if (direccionUpper.includes(comuna)) return comuna;
  }
  return null;
}

export async function geocodificarDireccion(
  direccion: string,
): Promise<ResultadoGeocodificacion> {
  const estadoRed = await NetInfo.fetch();
  if (!estadoRed.isConnected || !estadoRed.isInternetReachable) {
    return { status: "sin_conexion" };
  }

  try {
    // Intento 1: la dirección completa tal cual, con contexto de Chile
    const coordsExactas = await buscarEnNominatim(`${direccion}, Chile`);
    if (coordsExactas) {
      return { status: "ok", coords: coordsExactas };
    }

    // Espera 1.1s antes del segundo intento (respetar límite de Nominatim)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Intento 2: solo la comuna/ciudad, como aproximación
    const comuna = extraerComuna(direccion);
    if (comuna) {
      const coordsAproximadas = await buscarEnNominatim(`${comuna}, Chile`);
      if (coordsAproximadas) {
        return { status: "aproximado", coords: coordsAproximadas };
      }
    }

    return { status: "no_encontrado" };
  } catch (error) {
    console.error("Error geocodificando:", error);
    return { status: "sin_conexion" };
  }
}
