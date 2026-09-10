export interface FilaCSV {
  nombre: string;
  rut: string;
  direccion: string;
  ultimaVisita?: string;
}

function detectarSeparador(primeraLinea: string): string {
  const puntoYComa = (primeraLinea.match(/;/g) || []).length;
  const coma = (primeraLinea.match(/,/g) || []).length;
  return puntoYComa > coma ? ";" : ",";
}

function parsearLinea(linea: string, separador: string): string[] {
  const resultado: string[] = [];
  let actual = "";
  let dentroDeComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const char = linea[i];
    if (char === '"') {
      dentroDeComillas = !dentroDeComillas;
    } else if (char === separador && !dentroDeComillas) {
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

  const separador = detectarSeparador(lineas[0]);

  const encabezado = parsearLinea(lineas[0], separador).map((h) =>
    h.toLowerCase().trim(),
  );
  const indiceNombre = encabezado.findIndex((h) => h.includes("nombre"));
  const indiceRut = encabezado.findIndex((h) => h.includes("rut"));
  const indiceDireccion = encabezado.findIndex((h) => h.includes("direcc"));
  // Columna opcional: acepta encabezados como "ultima visita", "última_visita", "fecha visita"
  const indiceUltimaVisita = encabezado.findIndex(
    (h) => h.includes("visita") || h.includes("ultima"),
  );

  if (indiceNombre === -1 || indiceRut === -1 || indiceDireccion === -1) {
    throw new Error(
      'El archivo debe tener columnas "nombre", "rut" y "direccion" en la primera fila',
    );
  }

  const filas: FilaCSV[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const valores = parsearLinea(lineas[i], separador);
    const nombre = valores[indiceNombre]?.trim();
    const rut = valores[indiceRut]?.trim();
    const direccion = valores[indiceDireccion]?.trim();
    const ultimaVisita =
      indiceUltimaVisita !== -1
        ? valores[indiceUltimaVisita]?.trim() || undefined
        : undefined;

    if (nombre && rut && direccion) {
      filas.push({ nombre, rut, direccion, ultimaVisita });
    }
  }

  return filas;
}
