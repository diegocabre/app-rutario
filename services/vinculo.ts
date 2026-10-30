const HOST_PANEL = "rutario.solucionesdys.cl";
const TOKEN = /^[0-9a-f]{48}$/;

// Acepta el enlace del QR del panel o el token pegado a mano; cualquier otro QR se rechaza
export function tokenDesdeQR(texto: string): string | null {
  const limpio = texto.trim();
  if (TOKEN.test(limpio)) return limpio;
  try {
    const url = new URL(limpio);
    const token = url.searchParams.get("t") ?? "";
    return url.hostname === HOST_PANEL && url.pathname === "/vincular" && TOKEN.test(token) ? token : null;
  } catch {
    return null;
  }
}

// Mensajes de los errores que lanza canjear_invitacion en la base
export function mensajeErrorVinculo(mensaje: string): string {
  if (mensaje.includes("invitacion_invalida")) return "Este código venció o ya se usó. Pide uno nuevo a tu empresa.";
  if (mensaje.includes("ya_vinculado")) return "Este teléfono ya está vinculado a una empresa.";
  if (mensaje.includes("limite_demo_vendedores")) return "Tu empresa está en plan demo y ya tiene un vendedor vinculado.";
  return "Necesitas internet para vincular. Revisa tu conexión e inténtalo otra vez.";
}
