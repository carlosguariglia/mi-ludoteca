/**
 * Servicio de sincronización de MiLudoteca con un GitHub Gist privado.
 *
 * Local-first: el estado se guarda en localStorage y solo se sincroniza bajo
 * demanda mediante la API REST de GitHub. No contiene tokens ni IDs fijos.
 */

const GIST_API_BASE = 'https://api.github.com/gists';
const GIST_FILE_NAME = 'miludoteca-db.json';
const AUTH_STORAGE_KEY = 'miludoteca_auth';
const STATE_STORAGE_KEY = 'miludoteca_state_v1';

/**
 * Almacenamiento de respaldo para entornos sin localStorage (por ejemplo,
 * tests ejecutados con Node).
 * @type {Map<string, string>}
 */
const memoryStorage = new Map();

/**
 * @typedef {Object} LudotecaState
 * @property {number} version
 * @property {string|null} lastSync
 * @property {Array<Object>} games
 * @property {Array<Object>} plays
 */

/**
 * Devuelve localStorage si existe y expone las operaciones necesarias.
 * @returns {Object|null} Instancia de localStorage o null si no está disponible.
 */
function getLocalStorage() {
  try {
    const storage = globalThis.localStorage;
    if (
      storage &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function'
    ) {
      return storage;
    }
  } catch {
    // El acceso puede fallar por permisos o por el modo privado del navegador.
  }
  return null;
}

/**
 * Lee un valor del storage, usando memoria como respaldo.
 * @param {string} key Clave a leer.
 * @returns {string|null} Valor almacenado o null si no existe.
 */
function readStorage(key) {
  const storage = getLocalStorage();
  if (storage) {
    try {
      return storage.getItem(key);
    } catch {
      // Si falla localStorage, se intenta el respaldo en memoria.
    }
  }
  return memoryStorage.has(key) ? memoryStorage.get(key) : null;
}

/**
 * Escribe un valor en el storage, usando memoria como respaldo.
 * @param {string} key Clave a escribir.
 * @param {string} value Valor serializado.
 * @returns {void}
 * @throws {Error} Si localStorage existe pero rechaza la escritura.
 */
function writeStorage(key, value) {
  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.setItem(key, value);
      return;
    } catch (error) {
      throw new Error(
        `No se pudo escribir en localStorage la clave "${key}".`,
        { cause: error }
      );
    }
  }
  memoryStorage.set(key, value);
}

/**
 * Normaliza un valor de autenticación a un string sin espacios extremos.
 * @param {unknown} value Valor a normalizar.
 * @returns {string} String normalizado o cadena vacía.
 */
function normalizeAuthValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Crea un estado vacío e independiente en cada llamada.
 * @returns {LudotecaState} Estado por defecto.
 */
function createDefaultState() {
  return {
    version: 1,
    lastSync: null,
    games: [],
    plays: [],
  };
}

/**
 * Normaliza cualquier valor al contrato de datos de MiLudoteca.
 * @param {unknown} state Valor a normalizar.
 * @returns {LudotecaState} Estado con las cuatro claves del schema.
 */
function normalizeState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return createDefaultState();
  }

  return {
    version:
      typeof state.version === 'number' && Number.isFinite(state.version)
        ? state.version
        : 1,
    lastSync: typeof state.lastSync === 'string' ? state.lastSync : null,
    games: Array.isArray(state.games) ? state.games : [],
    plays: Array.isArray(state.plays) ? state.plays : [],
  };
}

/**
 * Construye la URL del Gist a partir de su identificador.
 * @param {string} gistId Identificador del Gist.
 * @returns {string} URL completa del endpoint.
 */
function buildGistUrl(gistId) {
  return `${GIST_API_BASE}/${encodeURIComponent(gistId)}`;
}

/**
 * Verifica que una URL pertenezca a un dominio de GitHub antes de enviarle el
 * token, para no filtrarlo hacia hosts inesperados.
 * @param {string} url URL a validar.
 * @returns {boolean} true si es una URL https de GitHub.
 */
function isTrustedGitHubUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'api.github.com' ||
        parsed.hostname === 'github.com' ||
        parsed.hostname.endsWith('.githubusercontent.com'))
    );
  } catch {
    return false;
  }
}

/**
 * Construye los headers requeridos por la API de GitHub.
 * @param {string} token Personal Access Token.
 * @returns {Object} Headers de la petición.
 */
function buildHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/**
 * Obtiene la configuración de autenticación guardada.
 *
 * Tolera JSON corrupto, valores ausentes o un storage no disponible. Nunca
 * registra el token en la consola.
 *
 * @returns {{ token: string, gistId: string }} Configuración normalizada; las
 * claves faltantes se devuelven como cadena vacía.
 */
export function getAuthConfig() {
  const raw = readStorage(AUTH_STORAGE_KEY);
  if (!raw) {
    return { token: '', gistId: '' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { token: '', gistId: '' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { token: '', gistId: '' };
  }

  return {
    token: normalizeAuthValue(parsed.token),
    gistId: normalizeAuthValue(parsed.gistId),
  };
}

/**
 * Valida y persiste el token y el gistId en localStorage.
 * @param {string} token Personal Access Token de GitHub.
 * @param {string} gistId Identificador del Gist privado.
 * @returns {{ token: string, gistId: string }} Configuración normalizada.
 * @throws {Error} Si alguno de los valores no es un string no vacío.
 */
export function saveAuthConfig(token, gistId) {
  const normalizedToken = normalizeAuthValue(token);
  const normalizedGistId = normalizeAuthValue(gistId);

  if (!normalizedToken) {
    throw new Error(
      'El token de GitHub es obligatorio y no puede estar vacío.'
    );
  }
  if (!normalizedGistId) {
    throw new Error(
      'El gistId de GitHub es obligatorio y no puede estar vacío.'
    );
  }

  const auth = { token: normalizedToken, gistId: normalizedGistId };
  writeStorage(AUTH_STORAGE_KEY, JSON.stringify(auth));
  return { ...auth };
}

/**
 * Carga el estado local desde localStorage.
 *
 * Si no existe, está corrupto o no es un objeto, devuelve el estado por
 * defecto en lugar de lanzar una excepción.
 *
 * @returns {LudotecaState} Estado normalizado.
 */
export function loadLocalState() {
  const raw = readStorage(STATE_STORAGE_KEY);
  if (!raw) {
    return createDefaultState();
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      '[MiLudoteca] El estado local está corrupto; se usará el estado por defecto.'
    );
    return createDefaultState();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(
      '[MiLudoteca] El estado local no es un objeto válido; se usará el estado por defecto.'
    );
    return createDefaultState();
  }

  return normalizeState(parsed);
}

/**
 * Normaliza y persiste el estado completo en localStorage.
 *
 * No modifica `lastSync`; ese campo solo lo actualiza la sincronización.
 *
 * @param {unknown} state Estado a guardar.
 * @returns {LudotecaState} Estado normalizado y persistido.
 * @throws {Error} Si localStorage rechaza la escritura.
 */
export function saveLocalState(state) {
  const normalized = normalizeState(state);
  writeStorage(STATE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

/**
 * Recupera la autenticación y falla con un mensaje claro si está incompleta.
 * @returns {{ token: string, gistId: string }} Configuración completa.
 * @throws {Error} Si falta el token o el gistId.
 */
function requireAuth() {
  const auth = getAuthConfig();
  if (!auth.token || !auth.gistId) {
    throw new Error(
      'Configuración de GitHub incompleta: guardá el token y el gistId'
    );
  }
  return auth;
}

/**
 * Extrae el mensaje de error que GitHub incluye en el cuerpo JSON.
 * @param {Object} response Respuesta HTTP fallida.
 * @returns {Promise<string>} Mensaje remoto o cadena vacía.
 */
async function extractGitHubMessage(response) {
  try {
    const data = await response.json();
    if (data && typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }
  } catch {
    // Algunas respuestas de error no contienen JSON.
  }
  return '';
}

/**
 * Lanza un error en español cuando la respuesta HTTP no fue exitosa.
 * @param {Object} response Respuesta HTTP.
 * @param {string} action Descripción de la operación realizada.
 * @returns {Promise<void>}
 * @throws {Error} Si `response.ok` es falso.
 */
async function ensureResponseOk(response, action) {
  if (response.ok) {
    return;
  }

  const remoteMessage = await extractGitHubMessage(response);
  const detail = remoteMessage ? `: ${remoteMessage}` : '';
  throw new Error(
    `GitHub rechazó la operación de ${action} (HTTP ${response.status})${detail}. Revisá el token, el gistId y los permisos.`
  );
}

/**
 * Ejecuta una petición a GitHub y envuelve los fallos de red.
 * @param {string} url URL de destino.
 * @param {Object} options Opciones de `fetch`.
 * @param {string} action Descripción de la operación para los mensajes.
 * @returns {Promise<Object>} Respuesta exitosa.
 * @throws {Error} Si hay un fallo de red o la respuesta no es exitosa.
 */
async function githubRequest(url, options, action) {
  let response;
  try {
    response = await fetch(url, { ...options, cache: 'no-store' });
  } catch (error) {
    throw new Error(
      `Error de red al ${action} con GitHub. Verificá la conexión e intentá de nuevo.`,
      { cause: error }
    );
  }

  await ensureResponseOk(response, action);
  return response;
}

/**
 * Descarga el estado desde el Gist y lo persiste en localStorage.
 *
 * Soporta respuestas truncadas usando `raw_url` para obtener el contenido
 * completo del archivo `miludoteca-db.json`.
 *
 * @returns {Promise<LudotecaState>} Estado remoto normalizado y guardado localmente.
 * @throws {Error} Si falta la autenticación, falla la red, la respuesta HTTP no
 * es exitosa, el archivo no existe o su JSON es inválido.
 */
export async function pullFromGist() {
  const { token, gistId } = requireAuth();
  const response = await githubRequest(
    buildGistUrl(gistId),
    { method: 'GET', headers: buildHeaders(token) },
    'leer el Gist'
  );

  let gist;
  try {
    gist = await response.json();
  } catch (error) {
    throw new Error('La respuesta de GitHub no contiene un JSON válido.', {
      cause: error,
    });
  }

  const file = gist && gist.files ? gist.files[GIST_FILE_NAME] : null;
  if (!file || typeof file !== 'object') {
    throw new Error(
      `El Gist no contiene el archivo "${GIST_FILE_NAME}".`
    );
  }

  let content = file.content;
  const isTruncated = gist.truncated === true || file.truncated === true;

  if (isTruncated) {
    if (typeof file.raw_url !== 'string' || !file.raw_url) {
      throw new Error(
        `El archivo "${GIST_FILE_NAME}" está truncado y no incluye una URL para descargarlo completo.`
      );
    }
    if (!isTrustedGitHubUrl(file.raw_url)) {
      throw new Error(
        `La URL de descarga de "${GIST_FILE_NAME}" no apunta a un dominio de GitHub.`
      );
    }

    const rawResponse = await githubRequest(
      file.raw_url,
      { method: 'GET', headers: buildHeaders(token) },
      'descargar el contenido completo del Gist'
    );

    try {
      content = await rawResponse.text();
    } catch (error) {
      throw new Error(
        'No se pudo leer el contenido completo del Gist.',
        { cause: error }
      );
    }
  }

  if (typeof content !== 'string') {
    throw new Error(
      `El archivo "${GIST_FILE_NAME}" del Gist no tiene contenido de texto válido.`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `El contenido de "${GIST_FILE_NAME}" en el Gist no es un JSON válido.`,
      { cause: error }
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `El contenido de "${GIST_FILE_NAME}" en el Gist no tiene el formato esperado.`
    );
  }

  const normalized = normalizeState(parsed);
  return saveLocalState(normalized);
}

/**
 * Envía el estado al Gist y, solo si la petición fue exitosa, lo persiste localmente.
 *
 * Fuerza `version: 1` y actualiza `lastSync` con la fecha actual en ISO 8601.
 *
 * @param {unknown} state Estado a enviar.
 * @returns {Promise<LudotecaState>} Estado enviado y guardado localmente.
 * @throws {Error} Si falta la autenticación, falla la red, la respuesta HTTP no
 * es exitosa o no se puede persistir el estado localmente.
 */
export async function pushToGist(state) {
  const { token, gistId } = requireAuth();
  const normalized = normalizeState(state);

  const stateToPush = {
    version: 1,
    lastSync: new Date().toISOString(),
    games: normalized.games,
    plays: normalized.plays,
  };

  const requestBody = JSON.stringify({
    files: {
      [GIST_FILE_NAME]: {
        content: JSON.stringify(stateToPush, null, 2),
      },
    },
  });

  await githubRequest(
    buildGistUrl(gistId),
    {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: requestBody,
    },
    'guardar el Gist'
  );

  return saveLocalState(stateToPush);
}
