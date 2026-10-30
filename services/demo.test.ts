import assert from "node:assert/strict";
import { test } from "node:test";

import { cuposDisponibles } from "./demo.ts";

test("sin vincular quedan cupos hasta llegar a 2", () => {
  assert.equal(cuposDisponibles(0, false), 2);
  assert.equal(cuposDisponibles(1, false), 1);
  assert.equal(cuposDisponibles(2, false), 0);
});

test("con más clientes que el límite no hay cupos y no es negativo", () => {
  assert.equal(cuposDisponibles(158, false), 0);
});

test("vinculada no tiene límite", () => {
  assert.equal(cuposDisponibles(158, true), Infinity);
});
