import type { Cliente } from "@/types/cliente";

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

    // RUT y dirección pueden faltar: el cliente se completa y ubica después en terreno
    if (nombre) {
      filas.push({ nombre, rut: rut ?? "", direccion: direccion ?? "", ultimaVisita });
    }
  }

  return filas;
}

function campoCSV(valor: string | number | undefined): string {
  const texto = valor === undefined ? "" : String(valor);
  // El parser no entiende comillas escapadas: se reemplazan por simples
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, "'")}"` : texto;
}

// Respaldo con coordenadas; los encabezados nombre/rut/direccion/ultima_visita se pueden volver a importar
export function generarCSVClientes(clientes: Cliente[]): string {
  const encabezado = "nombre;rut;direccion;lat;lng;estado_ubicacion;ultima_visita";
  const filas = clientes.map((c) =>
    [c.nombre, c.rut, c.direccion, c.lat, c.lng, c.geoStatus, c.ultimaVisita]
      .map(campoCSV)
      .join(";"),
  );
  // BOM para que Excel lea bien los acentos
  const BOM = String.fromCharCode(0xfeff);
  return BOM + [encabezado, ...filas].join("\n");
}
