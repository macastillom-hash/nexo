
import { Resend } from "resend";
import { formidable } from "formidable";
import fs from "node:fs/promises";
import path from "node:path";

export const config = {
  api: { bodyParser: false }
};

// Límites del formulario
const TAMANO_MAXIMO = 3 * 1024 * 1024; // 3 MB en total
const MAX_ARCHIVOS = 5;

// Extensiones y tipos MIME permitidos
const TIPOS_PERMITIDOS = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

// Respuesta JSON
function respuesta(res, codigo, success, message) {
  return res.status(codigo).json({ success, message });
}

// Obtener el primer valor de un campo
function obtenerCampo(valor) {
  return Array.isArray(valor) ? valor[0] : valor;
}

// Limpiar y limitar textos
function texto(valor, maximo) {
  return typeof valor === "string"
    ? valor.trim().slice(0, maximo)
    : "";
}

// Validar formato de correo
function correoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

// Escapar caracteres HTML
function escaparHTML(valor = "") {
  return String(valor).replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

// Validar el contenido real del archivo
function esArchivoValido(contenido, mime) {
  if (mime === "application/pdf") {
    return contenido.subarray(0, 5).toString() === "%PDF-";
  }

  if (mime === "image/jpeg") {
    return (
      contenido[0] === 0xff &&
      contenido[1] === 0xd8 &&
      contenido[2] === 0xff
    );
  }

  if (mime === "image/png") {
    return contenido.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  }

  if (mime === "image/webp") {
    return (
      contenido.subarray(0, 4).toString() === "RIFF" &&
      contenido.subarray(8, 12).toString() === "WEBP"
    );
  }

  return false;
}

// Obtener los archivos enviados
function obtenerArchivos(files) {
  const recibidos = files["archivos[]"] ?? files.archivos ?? [];

  return (Array.isArray(recibidos) ? recibidos : [recibidos])
    .filter(Boolean);
}

// Eliminar archivos temporales
async function eliminarTemporales(archivos) {
  await Promise.all(
    archivos.map((archivo) =>
      archivo?.filepath
        ? fs.unlink(archivo.filepath).catch(() => {})
        : Promise.resolve()
    )
  );
}

// Controlador principal
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respuesta(res, 405, false, "Método no permitido.");
  }

  let archivosTemporales = [];

  try {
    // Configuración de Formidable
    const form = formidable({
      multiples: true,
      maxFiles: MAX_ARCHIVOS,
      maxFileSize: TAMANO_MAXIMO,
      maxTotalFileSize: TAMANO_MAXIMO,
      maxFields: 10,
      maxFieldsSize: 16 * 1024,

      // IMPORTANTE:
      // Permite que el formulario llegue sin archivos.
      allowEmptyFiles: true,
      minFileSize: 0
    });

    const [fields, files] = await form.parse(req);

    // Guardamos todos los archivos recibidos para eliminarlos
    // al terminar, incluso si alguno está vacío.
    archivosTemporales = obtenerArchivos(files);

    // Ignorar archivos vacíos
    const archivosAdjuntos = archivosTemporales.filter(
      (archivo) => Number(archivo.size) > 0
    );

    // Campo trampa contra algunos envíos automatizados
    if (texto(obtenerCampo(fields.website), 200)) {
      return respuesta(res, 200, true, "Solicitud recibida.");
    }

    // Obtener los datos del formulario
    const nombre = texto(obtenerCampo(fields.nombre), 70);
    const apellido = texto(obtenerCampo(fields.apellido), 70);
    const correo = texto(obtenerCampo(fields.correo), 254).toLowerCase();
    const tipo = texto(obtenerCampo(fields.tipo), 30);
    const descripcion = texto(obtenerCampo(fields.descripcion), 2000);

    // Validar campos obligatorios
    if (
      nombre.length < 2 ||
      apellido.length < 2 ||
      !correo ||
      !tipo ||
      descripcion.length < 15
    ) {
      return respuesta(
        res,
        400,
        false,
        "Revisa los campos obligatorios. La descripción debe tener al menos 15 caracteres."
      );
    }

    // Validar correo
    if (!correoValido(correo)) {
      return respuesta(
        res,
        400,
        false,
        "El correo electrónico no es válido."
      );
    }

    // Tipos de consulta permitidos
    const tiposConsulta = {
      dudas: "Dudas",
      cotizar: "Cotizar",
      otro: "Otro"
    };

    if (!Object.hasOwn(tiposConsulta, tipo)) {
      return respuesta(
        res,
        400,
        false,
        "Selecciona un tipo de consulta válido."
      );
    }

    // Validar cantidad de archivos no vacíos
    if (archivosAdjuntos.length > MAX_ARCHIVOS) {
      return respuesta(
        res,
        400,
        false,
        "Puedes adjuntar máximo 5 archivos."
      );
    }

    // Validar tamaño total de archivos
    const totalBytes = archivosAdjuntos.reduce(
      (total, archivo) => total + Number(archivo.size || 0),
      0
    );

    if (totalBytes > TAMANO_MAXIMO) {
      return respuesta(
        res,
        400,
        false,
        "Los archivos superan el límite total de 3 MB."
      );
    }

    // Preparar archivos adjuntos
    const adjuntos = [];

    for (const archivo of archivosAdjuntos) {
      const nombreOriginal = archivo.originalFilename || "adjunto";
      const extension = path.extname(nombreOriginal).toLowerCase();
      const mimeEsperado = TIPOS_PERMITIDOS[extension];

      // Validar extensión y MIME
      if (!mimeEsperado || archivo.mimetype !== mimeEsperado) {
        return respuesta(
          res,
          400,
          false,
          "Solo se permiten archivos PDF, JPG, JPEG, PNG y WEBP."
        );
      }

      // Leer contenido
      const contenido = await fs.readFile(archivo.filepath);

      // Validar contenido real del archivo
      if (!esArchivoValido(contenido, mimeEsperado)) {
        return respuesta(
          res,
          400,
          false,
          `El archivo "${path.basename(nombreOriginal)}" no parece ser un archivo ${extension.toUpperCase()} válido.`
        );
      }

      // Agregar archivo a los adjuntos
      adjuntos.push({
        filename: path.basename(nombreOriginal).replace(/[\r\n]/g, "_"),
        content: contenido.toString("base64")
      });
    }

    // Obtener variables de entorno
    const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
    const DESTINO_EMAIL = process.env.DESTINO_EMAIL?.trim();
    const REMITENTE_EMAIL = process.env.REMITENTE_EMAIL?.trim();

    // Diagnóstico sin mostrar credenciales ni direcciones
    console.log("Diagnóstico de variables Nexo:", {
      apiKeyConfigurada: Boolean(RESEND_API_KEY),
      destinoConfigurado: Boolean(DESTINO_EMAIL),
      destinoFormatoValido: Boolean(
        DESTINO_EMAIL && correoValido(DESTINO_EMAIL)
      ),
      destinoLongitud: DESTINO_EMAIL?.length || 0,
      remitenteConfigurado: Boolean(REMITENTE_EMAIL)
    });

    // Validar configuración
    if (
      !RESEND_API_KEY ||
      !DESTINO_EMAIL ||
      !REMITENTE_EMAIL
    ) {
      console.error(
        "Falta configurar RESEND_API_KEY, DESTINO_EMAIL o REMITENTE_EMAIL."
      );

      return respuesta(
        res,
        500,
        false,
        "El servicio de correo no está configurado. Inténtalo más tarde."
      );
    }

    // Validar dirección de destino
    if (!correoValido(DESTINO_EMAIL)) {
      console.error(
        "DESTINO_EMAIL no tiene un formato de correo válido."
      );

      return respuesta(
        res,
        500,
        false,
        "La dirección de destino del correo no está configurada correctamente."
      );
    }

    // Inicializar Resend
    const resend = new Resend(RESEND_API_KEY);

    const nombreCompleto = `${nombre} ${apellido}`;

    const listaAdjuntos = adjuntos.length
      ? adjuntos
          .map(
            (archivo) =>
              `<li>${escaparHTML(archivo.filename)}</li>`
          )
          .join("")
      : "<li>No se adjuntaron archivos.</li>";

    // Enviar correo
    const { data, error } = await resend.emails.send({
      from: REMITENTE_EMAIL,
      to: [DESTINO_EMAIL],
      replyTo: correo,

      subject: `Nueva solicitud ${tiposConsulta[tipo]} - ${nombreCompleto}`,

      html: `
        <div style="font-family:Arial,sans-serif;color:#24352c;line-height:1.6;max-width:680px;margin:auto">

          <div style="background:#10231d;color:#fff;padding:22px 26px;border-radius:12px 12px 0 0">
            <h1 style="font-size:21px;margin:0">
              Nueva solicitud de Nexo Estudio
            </h1>
          </div>

          <div style="border:1px solid #e2e9df;border-top:0;padding:24px 26px;border-radius:0 0 12px 12px">

            <h2 style="font-size:16px;margin-top:0">
              Datos del visitante
            </h2>

            <p><strong>Nombre:</strong> ${escaparHTML(nombreCompleto)}</p>

            <p><strong>Correo:</strong> ${escaparHTML(correo)}</p>

            <p><strong>Tipo de consulta:</strong> ${escaparHTML(tiposConsulta[tipo])}</p>

            <h2 style="font-size:16px">Descripción</h2>

            <p style="white-space:pre-wrap">${escaparHTML(descripcion)}</p>

            <h2 style="font-size:16px">
              Archivos adjuntos (${adjuntos.length})
            </h2>

            <ul>
              ${listaAdjuntos}
            </ul>

          </div>
        </div>
      `,

      text: `
Nueva solicitud de Nexo Estudio

Nombre: ${nombreCompleto}
Correo: ${correo}
Tipo: ${tiposConsulta[tipo]}

Descripción:
${descripcion}

Archivos adjuntos: ${adjuntos.length}
      `,

      attachments: adjuntos
    });

    // Comprobar resultado de Resend
    if (error) {
      console.error("Error devuelto por Resend:", {
        message: error.message,
        name: error.name,
        statusCode: error.statusCode
      });

      return respuesta(
        res,
        502,
        false,
        "No pudimos enviar tu solicitud en este momento. Inténtalo nuevamente más tarde."
      );
    }

    // Confirmar envío
    console.log("Correo enviado correctamente por Resend:", data?.id);

    return respuesta(
      res,
      200,
      true,
      "Tu solicitud fue enviada correctamente."
    );

  } catch (error) {
    console.error("Error procesando el formulario de Nexo:", error);

    const codigo =
      error?.httpCode === 413 || error?.code === 1009
        ? 413
        : 400;

    const mensaje =
      codigo === 413
        ? "El tamaño de los archivos supera el límite permitido de 3 MB."
        : "No se pudo procesar el formulario. Verifica los datos y los archivos e inténtalo nuevamente.";

    return respuesta(res, codigo, false, mensaje);

  } finally {
    // Eliminar todos los archivos temporales
    await eliminarTemporales(archivosTemporales);
  }
}

