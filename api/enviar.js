const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const DESTINO_EMAIL = process.env.DESTINO_EMAIL?.trim();
const REMITENTE_EMAIL = process.env.REMITENTE_EMAIL?.trim();

const formatoDestinoValido =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(DESTINO_EMAIL || "");

console.log("Diagnóstico de variables Nexo:", {
  apiKeyConfigurada: Boolean(RESEND_API_KEY),
  destinoConfigurado: Boolean(DESTINO_EMAIL),
  destinoFormatoValido: formatoDestinoValido,
  destinoLongitud: DESTINO_EMAIL?.length || 0,
  remitenteConfigurado: Boolean(REMITENTE_EMAIL)
});

if (!RESEND_API_KEY || !DESTINO_EMAIL || !REMITENTE_EMAIL || !formatoDestinoValido) {
  console.error("Configuración de correo incompleta o inválida.");

  return respuesta(
    res,
    500,
    false,
    "El servicio de correo no está configurado correctamente."
  );
}
