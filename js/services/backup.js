/**
 * Formato de las copias de seguridad de MiLudoteca.
 *
 * Una copia es un archivo JSON que puede descargarse y enviarse por WhatsApp,
 * email o cualquier servicio de archivos. Al importarlo se reemplaza el estado
 * local completo.
 */

import { normalizeState } from './localStore.js';

export const BACKUP_APP = 'miludoteca';
export const BACKUP_SCHEMA_VERSION = 1;

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const OWNERSHIP_VALUES = ['owned', 'borrowed', 'played_elsewhere'];

/**
 * @typedef {Object} BackupFile
 * @property {string} app
 * @property {number} schemaVersion
 * @property {string} exportedAt
 * @property {{ version: number, games: Array<Object>, plays: Array<Object> }} state
 */

/**
 * Convierte un valor en texto sin espacios extremos.
 * @param {unknown} value Valor a normalizar.
 * @returns {string} Texto normalizado.
 */
function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

/**
 * @param {unknown} value Valor a interpretar.
 * @param {number} fallback Respaldo.
 * @returns {number} Entero o el respaldo.
 */
function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Valida una fecha real en formato YYYY-MM-DD.
 * @param {string} value Texto a validar.
 * @returns {boolean} true si es una fecha válida.
 */
function isValidDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Devuelve la fecha de hoy en formato YYYY-MM-DD según la hora local.
 * @param {Date} date Fecha de referencia.
 * @returns {string} Fecha local.
 */
function toDateStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Construye el nombre del archivo de respaldo.
 * @param {Date} [date] Fecha de referencia.
 * @returns {string} Nombre tipo `miludoteca-2026-11-14.json`.
 */
export function buildBackupFilename(date = new Date()) {
  return `miludoteca-${toDateStamp(date)}.json`;
}

/**
 * Crea el objeto de respaldo.
 * @param {unknown} state Estado actual.
 * @param {Date} [date] Fecha de exportación.
 * @returns {BackupFile} Contenido del archivo.
 */
export function createBackup(state, date = new Date()) {
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: date.toISOString(),
    state: normalizeState(state),
  };
}

/**
 * Serializa el estado como archivo JSON legible.
 * @param {unknown} state Estado actual.
 * @param {Date} [date] Fecha de exportación.
 * @returns {string} JSON con indentación de 2 espacios.
 */
export function serializeBackup(state, date = new Date()) {
  return `${JSON.stringify(createBackup(state, date), null, 2)}\n`;
}

/**
 * Normaliza y valida un juego importado.
 * @param {unknown} game Juego recibido.
 * @param {number} index Posición en el archivo.
 * @returns {Object} Juego normalizado.
 * @throws {Error} Si el juego no es válido.
 */
function parseGame(game, index) {
  if (!game || typeof game !== 'object' || Array.isArray(game)) {
    throw new Error(`El juego #${index + 1} del archivo no es válido.`);
  }

  const bggId = toText(game.bggId);
  if (!bggId) {
    throw new Error(
      `El juego #${index + 1} del archivo no tiene un identificador "bggId".`
    );
  }

  return {
    ...game,
    bggId,
    title: toText(game.title),
    ownership: OWNERSHIP_VALUES.includes(game.ownership)
      ? game.ownership
      : 'played_elsewhere',
    ownerNote: toText(game.ownerNote),
    bggBaselinePlays: Math.max(0, toInt(game.bggBaselinePlays, 0)),
    minPlayers: Math.max(1, toInt(game.minPlayers, 1)),
    maxPlayers: Math.max(1, toInt(game.maxPlayers, 1)),
    playingTime: Math.max(0, toInt(game.playingTime, 0)),
  };
}

/**
 * Normaliza y valida una partida importada.
 * @param {unknown} play Partida recibida.
 * @param {number} index Posición en el archivo.
 * @returns {Object} Partida normalizada.
 * @throws {Error} Si la partida no es válida.
 */
function parsePlay(play, index) {
  if (!play || typeof play !== 'object' || Array.isArray(play)) {
    throw new Error(`La partida #${index + 1} del archivo no es válida.`);
  }

  const id = toText(play.id);
  if (!id) {
    throw new Error(`La partida #${index + 1} del archivo no tiene "id".`);
  }

  const bggId = toText(play.bggId);
  if (!bggId) {
    throw new Error(`La partida #${index + 1} del archivo no tiene "bggId".`);
  }

  const date = toText(play.date);
  if (!isValidDateOnly(date)) {
    throw new Error(
      `La partida #${index + 1} del archivo tiene una fecha inválida (se espera YYYY-MM-DD).`
    );
  }

  const players = toInt(play.players, 0);
  if (players < 1) {
    throw new Error(
      `La partida #${index + 1} del archivo debe tener al menos 1 jugador.`
    );
  }

  return {
    ...play,
    id,
    bggId,
    date,
    players,
    notes: toText(play.notes),
  };
}

/**
 * Valida el contenido ya parseado de una copia.
 *
 * Acepta el formato con envoltorio (`app`, `schemaVersion`, `state`) o un estado
 * crudo (`games` y `plays`) por compatibilidad.
 *
 * @param {unknown} payload Contenido JSON.
 * @returns {{ state: Object, exportedAt: string|null }} Estado validado.
 * @throws {Error} Si el formato no es válido.
 */
export function parseBackupPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('El archivo no contiene una copia válida de MiLudoteca.');
  }

  let stateSource = payload;
  let exportedAt = null;

  if (payload.app !== undefined) {
    if (payload.app !== BACKUP_APP) {
      throw new Error('El archivo no es una copia de MiLudoteca.');
    }
    if (
      typeof payload.schemaVersion === 'number' &&
      payload.schemaVersion > BACKUP_SCHEMA_VERSION
    ) {
      throw new Error(
        'La copia fue creada con una versión más nueva de MiLudoteca. Actualizá la app para importarla.'
      );
    }
    exportedAt =
      typeof payload.exportedAt === 'string' ? payload.exportedAt : null;
    stateSource = payload.state;
  }

  if (!stateSource || typeof stateSource !== 'object' || Array.isArray(stateSource)) {
    throw new Error('La copia no contiene un estado válido.');
  }

  if (!Array.isArray(stateSource.games) || !Array.isArray(stateSource.plays)) {
    throw new Error(
      'La copia no contiene las listas "games" y "plays" esperadas.'
    );
  }

  return {
    state: {
      version: BACKUP_SCHEMA_VERSION,
      games: stateSource.games.map(parseGame),
      plays: stateSource.plays.map(parsePlay),
    },
    exportedAt,
  };
}

/**
 * Lee, parsea y valida un archivo de copia de seguridad.
 * @param {File|Blob|string} file Archivo, Blob o texto JSON.
 * @returns {Promise<{ state: Object, exportedAt: string|null }>}
 * @throws {Error} Si el archivo no se puede leer o no es válido.
 */
export async function parseBackupFile(file) {
  if (!file) {
    throw new Error('No se seleccionó ningún archivo.');
  }

  if (typeof file.size === 'number' && file.size > MAX_BACKUP_BYTES) {
    throw new Error('El archivo supera el límite de 10 MB.');
  }

  let text;
  if (typeof file === 'string') {
    text = file;
  } else if (typeof file.text === 'function') {
    try {
      text = await file.text();
    } catch (error) {
      throw new Error('No se pudo leer el archivo seleccionado.', {
        cause: error,
      });
    }
  } else {
    throw new Error('El archivo seleccionado no se puede leer como texto.');
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error('El archivo no contiene un JSON válido.', { cause: error });
  }

  return parseBackupPayload(payload);
}
