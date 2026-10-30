import assert from "node:assert/strict";
import { test } from "node:test";

import { generarCSVClientes, parsearCSV } from "./csv.ts";

test("el CSV exportado se vuelve a leer con el mismo nombre, rut y dirección", () => {
  const clientes = [
    {
      id: "1",
      nombre: "CARLOS AROS, INGENIERIA; \"CNC\" SUR",
      rut: "77830911-4",
      direccion: "Av. Diego Portales 805, Puerto Montt",
      lat: -41.47,
      lng: -72.94,
      geoStatus: "ok" as const,
      ultimaVisita: "2026-10-29",
    },
    { id: "2", nombre: "MAQSUR", rut: "", direccion: "", geoStatus: "manual" as const },
  ];

  const csv = generarCSVClientes(clientes);
  assert.ok(csv.startsWith("﻿nombre;"));
  assert.match(csv, /-41\.47;-72\.94;ok;2026-10-29/);

  const filas = parsearCSV(csv);
  assert.equal(filas.length, 2);
  assert.equal(filas[0].nombre, "CARLOS AROS, INGENIERIA; 'CNC' SUR");
  assert.equal(filas[0].rut, "77830911-4");
  assert.equal(filas[0].direccion, "Av. Diego Portales 805, Puerto Montt");
  assert.equal(filas[0].ultimaVisita, "2026-10-29");
  assert.equal(filas[1].nombre, "MAQSUR");
});
