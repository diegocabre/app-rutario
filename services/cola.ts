import type { Cliente } from "@/types/cliente";

// Cambios hechos en terreno que esperan subir a la empresa. Cada uno tiene su propio id
// (visita, prospecto) o clave (ubicación por cliente), así reintentar nunca duplica.
export type Pendiente =
  | { tipo: "visita"; id: string; cliente_id: string; visitada_en: string; ultima_visita_anterior: string | null }
  | { tipo: "borrar_visita"; id: string }
  | { tipo: "ubicacion"; cliente_id: string; lat: number | null; lng: number | null; direccion: string; geo_status: Cliente["geoStatus"] }
  | { tipo: "prospecto"; id: string; nombre: string; rut: string; direccion: string; lat: number | null; lng: number | null };

export function agregarACola(cola: Pendiente[], nuevo: Pendiente): Pendiente[] {
  // Deshacer una visita que aún no sube: basta con no subirla
  if (nuevo.tipo === "borrar_visita" && cola.some((p) => p.tipo === "visita" && p.id === nuevo.id))
    return cola.filter((p) => !(p.tipo === "visita" && p.id === nuevo.id));
  // De la ubicación de un cliente solo importa la última corrección
  if (nuevo.tipo === "ubicacion")
    return [...cola.filter((p) => !(p.tipo === "ubicacion" && p.cliente_id === nuevo.cliente_id)), nuevo];
  return [...cola, nuevo];
}

export type FilaCliente = {
  id: string;
  nombre: string;
  rut: string;
  direccion: string;
  lat: number | null;
  lng: number | null;
  geo_status: string;
  ultima_visita: string | null;
};

// La lista del servidor manda, salvo las ubicaciones corregidas en terreno que todavía no suben
export function clientesDesdeServidor(filas: FilaCliente[], cola: Pendiente[]): Cliente[] {
  const ubicaciones = new Map(cola.flatMap((p) => (p.tipo === "ubicacion" ? [[p.cliente_id, p] as const] : [])));
  return filas.map((f) => {
    const local = ubicaciones.get(f.id);
    const lat = local ? local.lat : f.lat;
    const lng = local ? local.lng : f.lng;
    return {
      id: f.id,
      nombre: f.nombre,
      rut: f.rut,
      direccion: local?.direccion ?? f.direccion,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      geoStatus: (local?.geo_status ?? f.geo_status) as Cliente["geoStatus"],
      ultimaVisita: f.ultima_visita ?? undefined,
    };
  });
}

// shortcut: UUID v4 con Math.random (Hermes no trae crypto.randomUUID); basta como id de idempotencia,
// pasar a expo-crypto si algún día se usa para algo sensible
export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
