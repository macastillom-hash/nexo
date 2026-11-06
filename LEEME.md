# NEXO ESTUDIO — SITIO WEB + FORMULARIO CON RESEND

## Estructura
- `index.html`: página principal.
- `quienes-somos.html`: información del estudio.
- `contacto.html`: formulario de contacto y cotización.
- `css/estilos.css`: estilos originales del sitio (se conserva el diseño).
- `js/contacto.js`: validación en el navegador y envío del formulario.
- `api/enviar.js`: función backend de Vercel que valida los datos y envía el correo mediante Resend.
- `package.json`: dependencias del backend.
- `.env.example`: nombres de las variables que deben configurarse en Vercel; no contiene credenciales reales.

## Campos del formulario
- Nombre (obligatorio).
- Apellido (obligatorio).
- Correo electrónico (obligatorio).
- Tipo de consulta: Dudas, Cotizar u Otro (obligatorio).
- Descripción (obligatoria, entre 15 y 2000 caracteres).
- Archivos (opcional): máximo 5 y 3 MB en total; PDF, JPG/JPEG, PNG y WEBP.

El backend vuelve a validar los datos y comprueba las firmas básicas de los archivos. La validación del navegador no sustituye la validación del servidor.

## Configuración de Resend y Vercel
1. Crear o abrir el proyecto en Resend y obtener una API Key.
2. Verificar en Resend el dominio desde el que se enviarán los mensajes. El remitente debe pertenecer a un dominio verificado; no usar una dirección arbitraria como remitente.
3. Subir este proyecto a GitHub y conectarlo con Vercel.
4. En Vercel, abrir **Project → Settings → Environment Variables** y crear:
   - `RESEND_API_KEY`: API Key privada de Resend.
   - `DESTINO_EMAIL`: correo que recibirá las solicitudes de Nexo.
   - `REMITENTE_EMAIL`: remitente autorizado, por ejemplo `Nexo Estudio <contacto@tudominio.com>`.
5. Guardar las variables para los entornos necesarios (Production, y Preview si se desea probar allí).
6. Volver a desplegar el proyecto después de crear o modificar variables.
7. Probar el formulario desde el dominio de Vercel con y sin adjuntos.

**Seguridad:** nunca guardar la API Key en HTML, JavaScript del navegador, repositorio GitHub ni archivos públicos. `.env.example` solo documenta los nombres. Si se usa un archivo `.env` local, no debe subirse al repositorio; está excluido por `.gitignore`.

## Ejecución local
Requiere Node.js instalado.

```bash
npm install
```

Para probar la función API localmente con el entorno de Vercel, se recomienda usar Vercel CLI (`vercel dev`) y configurar las variables en un archivo `.env.local` no versionado. Abrir el HTML directamente con doble clic no ejecuta `/api/enviar`.

## Consideraciones
- Los adjuntos son opcionales. El total combinado no puede superar 3 MB.
- El correo del visitante se configura como `replyTo`, de modo que el equipo pueda responder directamente.
- El formulario incluye un campo honeypot básico contra bots. No equivale a CAPTCHA ni a un sistema robusto de limitación de frecuencia; si el formulario recibe spam, conviene añadir Turnstile u otra protección y rate limiting persistente.
- Vercel ejecuta `api/enviar.js` como función serverless. La carpeta `api` está en la raíz del proyecto.
- El diseño y la hoja de estilos de Nexo se mantienen; los cambios visuales se limitan a los mensajes de estado y la lista de archivos seleccionados.
