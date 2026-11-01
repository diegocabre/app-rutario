import { test } from "node:test";
import assert from "node:assert/strict";
import { agregarACola, clientesDesdeServidor, uuid, type Pendiente } from "./cola.ts";

const visita: Pendiente = { tipo: "visita", id: "v1", cliente_id: "c1", visitada_en: "2026-11-01T15:00:00Z", ultima_visita_anterior: null };

test("deshacer una visita que no ha subido la quita de la cola", () => {
  assert.deepEqual(agregarACola([visita], { tipo: "borrar_visita", id: "v1" }), []);
});

test("deshacer una visita ya subida encola el borrado", () => {
  assert.deepEqual(agregarACola([], { tipo: "borrar_visita", id: "v1" }), [{ tipo: "borrar_visita", id: "v1" }]);
});

test("de la ubicación de un cliente queda solo la última", () => {
  const u = (lat: number): Pendiente => ({ tipo: "ubicacion", cliente_id: "c1", lat, lng: -72, direccion: "x", geo_status: "manual" });
  const cola = agregarACola(agregarACola([visita], u(-41)), u(-42));
  assert.equal(cola.length, 2);
  assert.equal((cola[1] as { lat: number }).lat, -42);
});

test("la lista del servidor manda, salvo ubicaciones pendientes", () => {
  const filas = [
    { id: "c1", nombre: "Uno", rut: "1-9", direccion: "Vieja", lat: null, lng: null, geo_status: "manual", ultima_visita: null },
    { id: "c2", nombre: "Dos", rut: "", direccion: "Calle 2", lat: -41, lng: -73, geo_status: "ok", ultima_visita: "2026-10-01T15:00:00Z" },
  ];
  const cola: Pendiente[] = [{ tipo: "ubicacion", cliente_id: "c1", lat: -41.5, lng: -72.9, direccion: "Nueva", geo_status: "manual" }];
  const [uno, dos] = clientesDesdeServidor(filas, cola);
  assert.deepEqual([uno.lat, uno.direccion, uno.geoStatus], [-41.5, "Nueva", "manual"]);
  assert.deepEqual([dos.lat, dos.ultimaVisita], [-41, "2026-10-01T15:00:00Z"]);
});

test("uuid v4 válido y distinto cada vez", () => {
  const a = uuid();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, uuid());
});
