/**
 * Persistencia local del estado de MiLudoteca.
 *
 * El estado vive en localStorage; este módulo es la única puerta de entrada y
 * salida. No conoce la interfaz ni los respaldos en archivo.
 */

export const STATE_STORAGE_KEY = 'miludoteca_state_v1';

const META_STORAGE_KEY = 'miludoteca_backup_meta_v1';
const LEGACY_AUTH_KEY = 'miludoteca_auth';

/** Almacenamiento de respaldo para entornos sin localStorage (tests en Node). */
const memoryStorage = new Map();

/**
 * Devuelve localStorage si está disponible y expone las operaciones necesarias.
 * @returns {Storage|null} Instancia utilizable o null.
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
    // El acceso puede fallar por permisos o modo privado.
  }
  return null;
}

/**
 * @param {string} key Clave a leer.
 * @returns {string|null} Valor guardado o null.
 */
function readStorage(key) {
  const storage = getLocalStorage();
  if (storage) {
    try {
      return storage.getItem(key);
    } catch {
      // Se intenta el respaldo en memoria.
    }
  }
  return memoryStorage.has(key) ? memoryStorage.get(key) : null;
}

/**
 * @param {string} key Clave a escribir.
 * @param {string} value Valor serializado.
 * @returns {void}
 * @throws {Error} Si localStorage rechaza la escritura.
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
 * @param {string} key Clave a borrar.
 * @returns {void}
 */
function removeStorage(key) {
  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.removeItem(key);
    } catch {
      // Sin acción: el borrado es best-effort.
    }
  }
  memoryStorage.delete(key);
}

/**
 * Crea un estado vacío e independiente en cada llamada.
 * @returns {{ version: number, games: Array<Object>, plays: Array<Object> }}
 */
export function createEmptyState() {
  return { version: 1, games: [], plays: [] };
}

/**
 * Normaliza cualquier valor al contrato de datos de MiLudoteca.
 * @param {unknown} state Valor a normalizar.
 * @returns {{ version: number, games: Array<Object>, plays: Array<Object> }}
 */
export function normalizeState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return createEmptyState();
  }

  return {
    version:
      typeof state.version === 'number' && Number.isFinite(state.version)
        ? state.version
        : 1,
    games: Array.isArray(state.games)
      ? state.games.filter(
          (game) => game && typeof game === 'object' && !Array.isArray(game)
        )
      : [],
    plays: Array.isArray(state.plays)
      ? state.plays.filter(
          (play) => play && typeof play === 'object' && !Array.isArray(play)
        )
      : [],
  };
}

/**
 * Lee y normaliza el estado local.
 *
 * Ante ausencia, JSON corrupto o formato inválido devuelve un estado vacío sin
 * lanzar, para que la app siempre pueda arrancar.
 *
 * @returns {{ version: number, games: Array<Object>, plays: Array<Object> }}
 */
export function loadLocalState() {
  const raw = readStorage(STATE_STORAGE_KEY);
  if (!raw) {
    return createEmptyState();
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      '[MiLudoteca] El estado local está corrupto; se usará un estado vacío.'
    );
    return createEmptyState();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(
      '[MiLudoteca] El estado local no es válido; se usará un estado vacío.'
    );
    return createEmptyState();
  }

  const normalized = normalizeState(parsed);

  // Migración silenciosa: versiones anteriores guardaban lastSync.
  if (Object.prototype.hasOwnProperty.call(parsed, 'lastSync')) {
    try {
      writeStorage(STATE_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Si el navegador rechaza la escritura, se sigue usando el estado limpio.
    }
  }

  return normalized;
}

/**
 * Normaliza y persiste el estado completo; marca que hay cambios sin respaldar.
 * @param {unknown} state Estado a guardar.
 * @returns {{ version: number, games: Array<Object>, plays: Array<Object> }}
 * @throws {Error} Si localStorage rechaza la escritura.
 */
export function saveLocalState(state) {
  const normalized = normalizeState(state);
  writeStorage(STATE_STORAGE_KEY, JSON.stringify(normalized));

  const meta = readBackupMeta();
  writeStorage(
    META_STORAGE_KEY,
    JSON.stringify({ ...meta, dirty: true })
  );

  return normalized;
}

/**
 * @typedef {Object} BackupMeta
 * @property {string|null} lastBackupAt Fecha ISO del último respaldo.
 * @property {boolean} dirty Indica cambios posteriores al último respaldo.
 */

/**
 * @returns {BackupMeta} Metadatos de respaldo.
 */
function readBackupMeta() {
  const raw = readStorage(META_STORAGE_KEY);
  if (!raw) {
    return { lastBackupAt: null, dirty: true };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      lastBackupAt:
        typeof parsed.lastBackupAt === 'string' ? parsed.lastBackupAt : null,
      dirty: parsed.dirty !== false,
    };
  } catch {
    return { lastBackupAt: null, dirty: true };
  }
}

/**
 * Devuelve el estado de la copia de seguridad.
 * @returns {BackupMeta} Última fecha de respaldo y si hay cambios pendientes.
 */
export function getBackupMeta() {
  return readBackupMeta();
}

/**
 * Marca el estado actual como respaldado.
 * @param {Date} [when] Momento del respaldo.
 * @returns {BackupMeta} Metadatos actualizados.
 */
export function markBackupSaved(when = new Date()) {
  const meta = { lastBackupAt: when.toISOString(), dirty: false };
  writeStorage(META_STORAGE_KEY, JSON.stringify(meta));
  return meta;
}

/**
 * Borra la configuración de sincronización de versiones anteriores.
 * @returns {void}
 */
export function removeLegacyAuth() {
  removeStorage(LEGACY_AUTH_KEY);
}
