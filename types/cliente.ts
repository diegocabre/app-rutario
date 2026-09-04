export type NivelPrioridadVisita = "urgente" | "media" | "al_dia";

export interface Cliente {
  id: string;
  nombre: string;
  rut: string;
  direccion: string;
  lat?: number;
  lng?: number;
  geoStatus:
    | "pendiente"
    | "ok"
    | "aproximado"
    | "error"
    | "sin_conexion"
    | "no_encontrado";
  ultimaVisita?: string; // Fecha ISO o YYYY-MM-DD
}

export interface ClienteConDistancia extends Cliente {
  distanciaKm: number;
}

export interface RegistroVisita {
  clienteId: string;
  horaVisita: string;
  nombreCliente: string;
}

export interface PuntoGPS {
  latitude: number;
  longitude: number;
  timestamp: number;
}
