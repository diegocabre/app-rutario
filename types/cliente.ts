export interface Cliente {
  id: string;
  nombre: string;
  rut: string;
  direccion: string;
  lat?: number;
  lng?: number;
  geoStatus: "pendiente" | "ok" | "error" | "sin_conexion" | "no_encontrado";
}
