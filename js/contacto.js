(() => {
  const formulario = document.getElementById("contact-form");
  if (!formulario) return;

  const selectorArchivos = document.getElementById("archivos");
  const listaArchivos = document.getElementById("file-list");
  const botonEnviar = document.getElementById("submit-contact");
  const alerta = document.getElementById("form-alert");

  const MAX_ARCHIVOS = 5;
  const MAX_TAMANO = 3 * 1024 * 1024;
  const TIPOS_PERMITIDOS = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);
  const EXTENSIONES_PERMITIDAS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);

  function mostrarAlerta(mensaje, tipo) {
    alerta.textContent = mensaje;
    alerta.className = `form-alert form-alert-${tipo}`;
    alerta.hidden = false;
    alerta.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function limpiarAlerta() {
    alerta.hidden = true;
    alerta.textContent = "";
    alerta.className = "form-alert";
  }

  function validarArchivos(archivos) {
    if (archivos.length > MAX_ARCHIVOS) {
      return "Puedes adjuntar máximo 5 archivos.";
    }

    let pesoTotal = 0;
    for (const archivo of archivos) {
      const punto = archivo.name.lastIndexOf(".");
      const extension = punto >= 0 ? archivo.name.slice(punto).toLowerCase() : "";
      if (!EXTENSIONES_PERMITIDAS.has(extension) || !TIPOS_PERMITIDOS.has(archivo.type)) {
        return `El archivo «${archivo.name}» no tiene un formato permitido. Usa PDF, JPG, PNG o WEBP.`;
      }
      if (archivo.size === 0) return `El archivo «${archivo.name}» está vacío.`;
      pesoTotal += archivo.size;
    }

    if (pesoTotal > MAX_TAMANO) {
      return "Los archivos superan el límite total de 3 MB.";
    }
    return null;
  }

  function formatearPeso(bytes) {
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`;
  }

  function pintarArchivos() {
    listaArchivos.replaceChildren();
    for (const archivo of Array.from(selectorArchivos.files)) {
      const item = document.createElement("li");
      const nombre = document.createElement("span");
      nombre.textContent = archivo.name;
      const peso = document.createElement("strong");
      peso.textContent = formatearPeso(archivo.size);
      item.append(nombre, peso);
      listaArchivos.append(item);
    }
  }

  selectorArchivos.addEventListener("change", () => {
    limpiarAlerta();
    const error = validarArchivos(Array.from(selectorArchivos.files));
    if (error) {
      selectorArchivos.value = "";
      pintarArchivos();
      mostrarAlerta(error, "error");
      return;
    }
    pintarArchivos();
  });

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    limpiarAlerta();

    if (!formulario.reportValidity()) return;

    const archivos = Array.from(selectorArchivos.files);
    const errorArchivos = validarArchivos(archivos);
    if (errorArchivos) {
      mostrarAlerta(errorArchivos, "error");
      return;
    }

    const correo = document.getElementById("correo").value.trim();
    if (!correo) {
      mostrarAlerta("Escribe tu correo electrónico para poder responderte.", "error");
      document.getElementById("correo").focus();
      return;
    }

    const datos = new FormData(formulario);
    botonEnviar.disabled = true;
    botonEnviar.textContent = "Enviando solicitud…";

    try {
      const respuesta = await fetch("/api/enviar", {
        method: "POST",
        body: datos,
        headers: { Accept: "application/json" }
      });

      let resultado;
      try {
        resultado = await respuesta.json();
      } catch {
        throw new Error("El servidor respondió de forma inesperada. Inténtalo nuevamente.");
      }

      if (!respuesta.ok || !resultado.success) {
        throw new Error(resultado.message || "No se pudo enviar tu solicitud.");
      }

      formulario.reset();
      pintarArchivos();
      mostrarAlerta("¡Gracias! Recibimos tu solicitud correctamente. Nos pondremos en contacto contigo al correo indicado.", "success");
    } catch (error) {
      mostrarAlerta(error.message || "Ocurrió un error al enviar tu solicitud. Inténtalo nuevamente.", "error");
    } finally {
      botonEnviar.disabled = false;
      botonEnviar.innerHTML = 'Enviar solicitud <span aria-hidden="true">↗</span>';
    }
  });
})();
