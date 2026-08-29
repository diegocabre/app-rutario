import NetInfo from "@react-native-community/netinfo";

export interface Coordenadas {
  lat: number;
  lng: number;
}

export type ResultadoGeocodificacion =
  | { status: "ok"; coords: Coordenadas }
  | { status: "no_encontrado" }
  | { status: "sin_conexion" };

export async function geocodificarDireccion(
  direccion: string,
): Promise<ResultadoGeocodificacion> {
  const estadoRed = await NetInfo.fetch();

  if (!estadoRed.isConnected || !estadoRed.isInternetReachable) {
    return { status: "sin_conexion" };
  }

  try {
    const query = encodeURIComponent(direccion);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "RutarioApp/1.0",
      },
    });

    const data = await response.json();

    if (data && data.length > 0) {
      return {
        status: "ok",
        coords: {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        },
      };
    }

    return { status: "no_encontrado" };
  } catch (error) {
    console.error("Error geocodificando:", error);
    // Si falló la llamada en sí (no la búsqueda), asumimos problema de red
    return { status: "sin_conexion" };
  }
}
