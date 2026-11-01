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
    | "no_encontrado"
    | "manual"; // importado sin geocodificar: se ubica en terreno
  ultimaVisita?: string; // Fecha ISO o YYYY-MM-DD
}

export interface ClienteConDistancia extends Cliente {
  distanciaKm: number;
}

export interface RegistroVisita {
  id?: string; // UUID para subirla sin duplicar; registros antiguos (demo) no lo tienen
  clienteId: string;
  horaVisita: string;
  nombreCliente: string;
  ultimaVisitaAnterior?: string; // para restaurarla al deshacer la visita
}

export interface PuntoGPS {
  latitude: number;
  longitude: number;
  timestamp: number;
}
