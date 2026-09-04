export interface FilaCSV {
  nombre: string;
  rut: string;
  direccion: string;
  ultimaVisita?: string;
}

function parsearLineaCSV(linea: string): string[] {
  const resultado: string[] = [];
  let actual = "";
  let dentroDeComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const char = linea[i];
    if (char === '"') {
      dentroDeComillas = !dentroDeComillas;
    } else if (char === "," && !dentroDeComillas) {
      resultado.push(actual.trim());
      actual = "";
    } else {
      actual += char;
    }
  }
  resultado.push(actual.trim());
  return resultado;
}

export function parsearCSV(contenido: string): FilaCSV[] {
  const lineas = contenido
    .split(/\r?\n/)
    .filter((linea) => linea.trim().length > 0);

  if (lineas.length === 0) return [];

  const encabezado = parsearLineaCSV(lineas[0]).map((h) =>
    h.toLowerCase().trim(),
  );
  const indiceNombre = encabezado.findIndex((h) => h.includes("nombre"));
  const indiceRut = encabezado.findIndex((h) => h.includes("rut"));
  const indiceDireccion = encabezado.findIndex((h) => h.includes("direcc"));
  const indiceUltimaVisita = encabezado.findIndex(
    (h) => h.includes("visita") || h.includes("fecha"),
  );

  if (indiceNombre === -1 || indiceRut === -1 || indiceDireccion === -1) {
    throw new Error(
      'El archivo debe tener columnas "nombre", "rut" y "direccion" en la primera fila',
    );
  }

  const filas: FilaCSV[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const valores = parsearLineaCSV(lineas[i]);
    const nombre = valores[indiceNombre]?.trim();
    const rut = valores[indiceRut]?.trim();
    const direccion = valores[indiceDireccion]?.trim();
    const ultimaVisita =
      indiceUltimaVisita !== -1
        ? valores[indiceUltimaVisita]?.trim()
        : undefined;

    if (nombre && rut && direccion) {
      filas.push({
        nombre,
        rut,
        direccion,
        ultimaVisita: ultimaVisita || undefined,
      });
    }
  }

  return filas;
}
