export function limpiarRut(rut: string): string {
  return rut.replace(/[.\-\s]/g, "").toUpperCase();
}

export function formatearRut(rut: string): string {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${cuerpo}-${dv}`;
}

// Solo valida el FORMATO (largo y caracteres válidos), no el dígito
// verificador matemático — en datos reales de empresas es común que
// el DV tenga errores históricos que no vale la pena bloquear.
export function formatoRutValido(rut: string): boolean {
  const limpio = limpiarRut(rut);
  return /^[0-9]{6,9}[0-9K]$/.test(limpio);
}
