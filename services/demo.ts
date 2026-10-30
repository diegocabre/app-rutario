// Sin imports con alias: se prueba directo con `node --test services/*.test.ts`
export const LIMITE_DEMO = 2;
export const URL_PRODUCTO = "https://rutario.solucionesdys.cl";

// Cuántos clientes más se pueden agregar; nunca negativo aunque ya haya más del límite
export function cuposDisponibles(total: number, vinculada: boolean): number {
  return vinculada ? Infinity : Math.max(0, LIMITE_DEMO - total);
}
