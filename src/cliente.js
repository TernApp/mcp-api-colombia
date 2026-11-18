// Cliente que llama a la API Colombia a través de RapidAPI con la llave del usuario.
// Así cada consulta cuenta en el plan de RapidAPI del usuario (y se cobra allí).

export const RAPIDAPI_HOST_DEFECTO =
  process.env.RAPIDAPI_HOST || 'colombia-business-days-holidays-tax-data-uvt-trm.p.rapidapi.com';
export const URL_FICHA =
  process.env.RAPIDAPI_LISTING_URL || 'https://rapidapi.com/ProfJuanCarlosSilva/api/colombia-business-days-holidays-tax-data-uvt-trm';

export class ErrorApi extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * Crea una función `llamar(ruta, parametros)` que devuelve el JSON de la API.
 * opciones: { apiKey, host, baseUrl (solo pruebas), fetchFn, timeoutMs }
 */
export function crearCliente({ apiKey, host = RAPIDAPI_HOST_DEFECTO, baseUrl, fetchFn = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (!apiKey) throw new ErrorApi('Falta la llave de RapidAPI (X-RapidAPI-Key).', 401);
  const base = (baseUrl || `https://${host}`).replace(/\/+$/, '');

  return async function llamar(ruta, parametros = {}) {
    const url = new URL(base + ruta);
    for (const [k, v] of Object.entries(parametros)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }

    let resp;
    try {
      resp = await fetchFn(url, {
        headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': host, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new ErrorApi(`No se pudo conectar con la API (${e.name === 'TimeoutError' ? 'tiempo agotado' : e.message}).`, 503);
    }

    let cuerpo = null;
    const texto = await resp.text();
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      cuerpo = null;
    }

    if (resp.ok) return cuerpo;

    // Errores propios de la API: { error: { codigo, mensaje } }
    if (cuerpo?.error?.mensaje) throw new ErrorApi(cuerpo.error.mensaje, resp.status);

    // Errores del gateway de RapidAPI: { message: "..." }
    const msg = String(cuerpo?.message ?? texto ?? '').slice(0, 200);
    if (resp.status === 401 || resp.status === 403) {
      throw new ErrorApi(
        `RapidAPI rechazó la llave (${msg || resp.status}). Revisa tu X-RapidAPI-Key y suscríbete al plan Basic gratis en ${URL_FICHA}`,
        resp.status,
      );
    }
    if (resp.status === 429) {
      throw new ErrorApi(`Se alcanzó el límite del plan en RapidAPI (${msg}). Puedes subir de plan en ${URL_FICHA}`, 429);
    }
    throw new ErrorApi(`La API respondió con error ${resp.status}${msg ? `: ${msg}` : ''}.`, resp.status);
  };
}
