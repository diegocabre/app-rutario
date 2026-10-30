import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeErrorVinculo, tokenDesdeQR } from "./vinculo.ts";

const token = "a".repeat(48);

test("lee el token del enlace del panel", () => {
  assert.equal(tokenDesdeQR(`https://rutario.solucionesdys.cl/vincular?t=${token}`), token);
});

test("acepta el token pegado a mano", () => {
  assert.equal(tokenDesdeQR(`  ${token}\n`), token);
});

test("rechaza otros dominios, rutas o tokens mal formados", () => {
  assert.equal(tokenDesdeQR(`https://otro.cl/vincular?t=${token}`), null);
  assert.equal(tokenDesdeQR(`https://rutario.solucionesdys.cl/panel?t=${token}`), null);
  assert.equal(tokenDesdeQR("https://rutario.solucionesdys.cl/vincular?t=corto"), null);
  assert.equal(tokenDesdeQR("hola"), null);
});

test("traduce los errores de la base", () => {
  assert.match(mensajeErrorVinculo("invitacion_invalida"), /venció o ya se usó/);
  assert.match(mensajeErrorVinculo("TypeError: Network request failed"), /internet/);
});
