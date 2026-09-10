import { Cliente, RegistroVisita } from "@/types/cliente";
import * as FileSystem from "expo-file-system/legacy";

function fechaLegible(): string {
  return new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function generarCuerpoCorreo(
  visitadosHoy: RegistroVisita[],
  clientesPendientes: Cliente[],
  kmRecorridos: number,
): string {
  const listaVisitados =
    visitadosHoy.length > 0
      ? visitadosHoy
          .map((v) => `  • ${v.nombreCliente} — ${v.horaVisita}`)
          .join("\n")
      : "  (ninguno registrado hoy)";

  const listaPendientes =
    clientesPendientes.length > 0
      ? clientesPendientes.map((c) => `  • ${c.nombre}`).join("\n")
      : "  (todos los clientes de hoy fueron visitados)";

  return `Reporte de ruta — ${fechaLegible()}

RESUMEN
  Clientes visitados: ${visitadosHoy.length}
  Kilómetros recorridos: ${kmRecorridos.toFixed(1)} km

CLIENTES VISITADOS
${listaVisitados}

CLIENTES PENDIENTES
${listaPendientes}

—
Enviado desde Ruta DyS`;
}

// Genera un CSV con el detalle de las visitas de hoy, para adjuntar al correo
export async function generarArchivoAdjunto(
  visitadosHoy: RegistroVisita[],
): Promise<string> {
  const encabezado = "cliente,hora_visita";
  const filas = visitadosHoy.map(
    (v) => `"${v.nombreCliente}","${v.horaVisita}"`,
  );
  const contenido = [encabezado, ...filas].join("\n");

  const fecha = new Date().toISOString().split("T")[0];
  const ruta = `${FileSystem.cacheDirectory}reporte_${fecha}.csv`;

  await FileSystem.writeAsStringAsync(ruta, contenido, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return ruta;
}
