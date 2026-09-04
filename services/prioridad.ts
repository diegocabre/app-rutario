import { NivelPrioridadVisita } from "@/types/cliente";

export interface EstadoPrioridad {
  nivel: NivelPrioridadVisita;
  colorPin: "red" | "yellow" | "green";
  colorHex: string;
  fondoHex: string;
  textoColorHex: string;
  diasSinVisita: number | null;
  etiqueta: string;
  badgeTexto: string;
}

export function calcularDiasSinVisita(fechaStr?: string): number | null {
  if (!fechaStr) return null;
  const fecha = new Date(fechaStr);
  if (isNaN(fecha.getTime())) return null;

  const hoy = new Date();
  const utc1 = Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const utc2 = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.max(0, Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24)));
}

export function obtenerEstadoPrioridad(ultimaVisita?: string): EstadoPrioridad {
  const dias = calcularDiasSinVisita(ultimaVisita);

  // Más de 30 días o sin visita previa registrada -> Rojo (Urgente)
  if (dias === null || dias > 30) {
    return {
      nivel: "urgente",
      colorPin: "red",
      colorHex: "#dc2626",
      fondoHex: "#fee2e2",
      textoColorHex: "#991b1b",
      diasSinVisita: dias,
      etiqueta:
        dias === null ? "Sin visitas (+30 días)" : `Hace ${dias} días (+1 mes)`,
      badgeTexto: dias === null ? "🔴 >30 días" : `🔴 Hace ${dias}d`,
    };
  }

  // Entre 15 y 30 días sin visita -> Amarillo (Atención / Media)
  if (dias >= 15 && dias <= 30) {
    return {
      nivel: "media",
      colorPin: "yellow",
      colorHex: "#eab308",
      fondoHex: "#fef9c3",
      textoColorHex: "#854d0e",
      diasSinVisita: dias,
      etiqueta: `Hace ${dias} días (15-30 días)`,
      badgeTexto: `🟡 Hace ${dias}d`,
    };
  }

  // Menos de 15 días -> Verde (Al día / Reciente)
  return {
    nivel: "al_dia",
    colorPin: "green",
    colorHex: "#16a34a",
    fondoHex: "#dcfce7",
    textoColorHex: "#166534",
    diasSinVisita: dias,
    etiqueta:
      dias === 0
        ? "Visitado hoy"
        : `Visitado hace ${dias} ${dias === 1 ? "día" : "días"}`,
    badgeTexto: dias === 0 ? "🟢 Hoy" : `🟢 Hace ${dias}d`,
  };
}
