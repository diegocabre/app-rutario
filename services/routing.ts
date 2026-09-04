import { PuntoGPS } from "@/types/cliente";

export interface ResultadoRutaVial {
  puntos: PuntoGPS[];
  distanciaKm: number;
}

function calcularDistanciaDirectaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Consulta el servicio público de ruteo vial de OpenStreetMap (OSRM)
 * para obtener la trayectoria exacta que sigue las calles y la distancia vial en km.
 *
 * En caso de no haber conexión o fallar la consulta, retorna una aproximación directa (fallback).
 */
export async function obtenerRutaVialEntrePuntos(
  origen: { latitude: number; longitude: number },
  destino: { latitude: number; longitude: number },
): Promise<ResultadoRutaVial> {
  const distDirectaKm = calcularDistanciaDirectaKm(
    origen.latitude,
    origen.longitude,
    destino.latitude,
    destino.longitude,
  );

  // Si la distancia es mínima (menos de 30m), no es necesario consultar el servicio de ruteo
  if (distDirectaKm < 0.03) {
    return {
      puntos: [
        {
          latitude: destino.latitude,
          longitude: destino.longitude,
          timestamp: Date.now(),
        },
      ],
      distanciaKm: distDirectaKm,
    };
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${origen.longitude},${origen.latitude};${destino.longitude},${destino.latitude}?overview=full&geometries=geojson`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OSRM respondió con código ${response.status}`);
    }

    const data = await response.json();

    if (
      data.code === "Ok" &&
      data.routes &&
      data.routes.length > 0 &&
      data.routes[0].geometry &&
      Array.isArray(data.routes[0].geometry.coordinates)
    ) {
      const ruta = data.routes[0];
      const distanciaMetros = ruta.distance; // en metros
      const coords: [number, number][] = ruta.geometry.coordinates; // [lng, lat]

      const ahora = Date.now();
      const puntos: PuntoGPS[] = coords.map(([lng, lat], index) => ({
        latitude: lat,
        longitude: lng,
        timestamp: ahora + index * 50,
      }));

      return {
        puntos,
        distanciaKm: distanciaMetros / 1000,
      };
    }

    throw new Error("No se encontró ruta vial en la respuesta");
  } catch {
    // Fallback: si falla internet o la API, retornamos el punto destino y la distancia directa
    return {
      puntos: [
        {
          latitude: destino.latitude,
          longitude: destino.longitude,
          timestamp: Date.now(),
        },
      ],
      distanciaKm: distDirectaKm,
    };
  }
}
