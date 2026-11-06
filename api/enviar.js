import { Resend } from "resend";
import { formidable } from "formidable";
import fs from "node:fs/promises";
import path from "node:path";

export const config = {
  api: { bodyParser: false }
};

const TAMANO_MAXIMO = 3 * 1024 * 1024;
const MAX_ARCHIVOS = 5;
const TIPOS_PERMITIDOS = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

function respuesta(res, codigo, success, message) {
  return res.status(codigo).json({ success, message });
}

function obtenerCampo(valor) {
  return Array.isArray(valor) ? valor[0] : valor;
}

function texto(valor, maximo) {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

function escaparHTML(valor = "") {
  return String(valor).replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[caracter]);
}

function esArchivoValido(contenido, mime) {
  if (mime === "application/pdf") return contenido.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/jpeg") return contenido[0] === 0xff && contenido[1] === 0xd8 && contenido[2] === 0xff;
  if (mime === "image/png") return contenido.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return contenido.subarray(0, 4).toString() === "RIFF" && contenido.subarray(8, 12).toString() === "WEBP";
  return false;
}

function obtenerArchivos(files) {
  const recibidos = files["archivos[]"] ?? files.archivos ?? [];
  return (Array.isArray(recibidos) ? recibidos : [recibidos]).filter(Boolean);
}

function eliminarTemporales(archivos) {
  return Promise.all(archivos.map((archivo) =>
    archivo?.filepath ? fs.unlink(archivo.filepath).catch(() => {}) : Promise.resolve()
  ));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respuesta(res, 405, false, "Método no permitido.");
  }

  let archivosTemporales = [];
  try {
    const form = formidable({
      multiples: true,
      maxFiles: MAX_ARCHIVOS,
      maxFileSize: TAMANO_MAXIMO,
      maxTotalFileSize: TAMANO_MAXIMO,
      maxFields: 10,
      maxFieldsSize: 16 * 1024,
      allowEmptyFiles: false,
      minFileSize: 1
    });

    const [fields, files] = await form.parse(req);
    archivosTemporales = obtenerArchivos(files);

    // Campo trampa para reducir envíos automatizados. No sustituye un CAPTCHA.
    if (texto(obtenerCampo(fields.website), 200)) {
      return respuesta(res, 200, true, "Solicitud recibida.");
    }

    const nombre = texto(obtenerCampo(fields.nombre), 70);
    const apellido = texto(obtenerCampo(fields.apellido), 70);
    const correo = texto(obtenerCampo(fields.correo), 254).toLowerCase();
    const tipo = texto(obtenerCampo(fields.tipo), 30);
    const descripcion = texto(obtenerCampo(fields.descripcion), 2000);

    if (nombre.length < 2 || apellido.length < 2 || !correo || !tipo || descripcion.length < 15) {
      return respuesta(res, 400, false, "Revisa los campos obligatorios. La descripción debe tener al menos 15 caracteres.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return respuesta(res, 400, false, "El correo electrónico no es válido.");
    }

    const tiposConsulta = { dudas: "Dudas", cotizar: "Cotizar", otro: "Otro" };
    if (!Object.hasOwn(tiposConsulta, tipo)) {
      return respuesta(res, 400, false, "Selecciona un tipo de consulta válido.");
    }

    if (archivosTemporales.length > MAX_ARCHIVOS) {
      return respuesta(res, 400, false, "Puedes adjuntar máximo 5 archivos.");
    }

    const totalBytes = archivosTemporales.reduce((total, archivo) => total + archivo.size, 0);
    if (totalBytes > TAMANO_MAXIMO) {
      return respuesta(res, 400, false, "Los archivos superan el límite total de 3 MB.");
    }

    const adjuntos = [];
    for (const archivo of archivosTemporales) {
      const extension = path.extname(archivo.originalFilename || "").toLowerCase();
      const mimeEsperado = TIPOS_PERMITIDOS[extension];
      if (!mimeEsperado || archivo.mimetype !== mimeEsperado) {
        return respuesta(res, 400, false, "Solo se permiten archivos PDF, JPG, JPEG, PNG y WEBP.");
      }

      const contenido = await fs.readFile(archivo.filepath);
      if (!esArchivoValido(contenido, mimeEsperado)) {
        return respuesta(res, 400, false, `El archivo «${path.basename(archivo.originalFilename || "adjunto") }» no parece ser un archivo ${extension.toUpperCase()} válido.`);
      }

      adjuntos.push({
        filename: path.basename(archivo.originalFilename || `adjunto${extension}`).replace(/[\r\n]/g, "_"),
        content: contenido.toString("base64")
      });
    }

    const { RESEND_API_KEY, DESTINO_EMAIL, REMITENTE_EMAIL } = process.env;
    if (!RESEND_API_KEY || !DESTINO_EMAIL || !REMITENTE_EMAIL) {
      console.error("Falta configurar RESEND_API_KEY, DESTINO_EMAIL o REMITENTE_EMAIL.");
      return respuesta(res, 500, false, "El servicio de correo no está configurado. Inténtalo más tarde.");
    }

    const resend = new Resend(RESEND_API_KEY);
    const nombreCompleto = `${nombre} ${apellido}`;
    const listaAdjuntos = adjuntos.length
      ? adjuntos.map((archivo) => `<li>${escaparHTML(archivo.filename)}</li>`).join("")
      : "<li>No se adjuntaron archivos.</li>";

    const { error } = await resend.emails.send({
      from: REMITENTE_EMAIL,
      to: [DESTINO_EMAIL],
      replyTo: correo,
      subject: `Nueva solicitud ${tiposConsulta[tipo]} - ${nombreCompleto}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#24352c;line-height:1.6;max-width:680px;margin:auto">
          <div style="background:#10231d;color:#fff;padding:22px 26px;border-radius:12px 12px 0 0">
            <h1 style="font-size:21px;margin:0">Nueva solicitud de Nexo Estudio</h1>
          </div>
          <div style="border:1px solid #e2e9df;border-top:0;padding:24px 26px;border-radius:0 0 12px 12px">
            <h2 style="font-size:16px;margin-top:0">Datos del visitante</h2>
            <p><strong>Nombre:</strong> ${escaparHTML(nombreCompleto)}</p>
            <p><strong>Correo:</strong> ${escaparHTML(correo)}</p>
            <p><strong>Tipo de consulta:</strong> ${escaparHTML(tiposConsulta[tipo])}</p>
            <h2 style="font-size:16px">Descripción</h2>
            <p style="white-space:pre-wrap">${escaparHTML(descripcion)}</p>
            <h2 style="font-size:16px">Archivos adjuntos (${adjuntos.length})</h2>
            <ul>${listaAdjuntos}</ul>
          </div>
        </div>
      `,
      text: `Nueva solicitud de Nexo Estudio\nNombre: ${nombreCompleto}\nCorreo: ${correo}\nTipo: ${tiposConsulta[tipo]}\n\nDescripción:\n${descripcion}\n\nArchivos adjuntos: ${adjuntos.length}`,
      attachments: adjuntos
    });

    if (error) {
      console.error("Error devuelto por Resend:", error);
      return respuesta(res, 502, false, "No pudimos enviar tu solicitud en este momento. Inténtalo nuevamente más tarde.");
    }

    return respuesta(res, 200, true, "Tu solicitud fue enviada correctamente.");
  } catch (error) {
    console.error("Error procesando el formulario de Nexo:", error);
    const codigo = error?.httpCode === 413 || error?.code === 1009 ? 413 : 400;
    const mensaje = codigo === 413
      ? "El tamaño de los archivos supera el límite permitido de 3 MB."
      : "No se pudo procesar el formulario. Verifica los datos y los archivos e inténtalo nuevamente.";
    return respuesta(res, codigo, false, mensaje);
  } finally {
    await eliminarTemporales(archivosTemporales);
  }
}
