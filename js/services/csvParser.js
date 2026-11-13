/**
 * Importación del CSV de la colección de BoardGameGeek.
 *
 * Fusiona los datos de BGG sobre el estado local sin perder información propia
 * del usuario ni tocar las partidas. No persiste nada: el llamador decide
 * cuándo guardar el estado resultante.
 */

const REQUIRED_FIELDS = ['objectid', 'objectname'];

/**
 * @typedef {Object} LudotecaState
 * @property {number} version
 * @property {string|null} lastSync
 * @property {Array<Object>} games
 * @property {Array<Object>} plays
 */

/**
 * @typedef {Object} MergeStats
 * @property {number} added Juegos nuevos insertados.
 * @property {number} updated Juegos existentes actualizados.
 * @property {number} skipped Filas descartadas por no tener `objectid`.
 */

/**
 * Devuelve un estado normalizado sin mutar el valor recibido.
 * @param {unknown} state Estado actual de la aplicación.
 * @returns {LudotecaState} Estado con las cuatro claves del schema.
 */
function normalizeState(state) {
  const source =
    state && typeof state === 'object' && !Array.isArray(state) ? state : {};

  return {
    version:
      typeof source.version === 'number' && Number.isFinite(source.version)
        ? source.version
        : 1,
    lastSync: typeof source.lastSync === 'string' ? source.lastSync : null,
    games: Array.isArray(source.games) ? source.games : [],
    plays: Array.isArray(source.plays) ? source.plays : [],
  };
}

/**
 * Convierte un valor en texto sin espacios extremos.
 * @param {unknown} value Valor a normalizar.
 * @returns {string} Texto normalizado; cadena vacía si no hay valor.
 */
function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

/**
 * Interpreta un valor como entero con el default indicado.
 * @param {unknown} value Valor a interpretar.
 * @param {number} fallback Valor de respaldo.
 * @returns {number} Entero parseado o el respaldo.
 */
function toInt(value, fallback) {
  return parseInt(value, 10) || fallback;
}

/**
 * Asocia cada encabezado original con su nombre normalizado (sin BOM ni
 * espacios extremos) para tolerar exportaciones de distintas plataformas.
 * @param {Array<unknown>} fields Encabezados informados por PapaParse.
 * @returns {Map<string, string>} Mapa encabezado original → nombre normalizado.
 */
function buildFieldMap(fields) {
  const fieldMap = new Map();
  for (const field of fields) {
    if (typeof field !== 'string') {
      continue;
    }
    fieldMap.set(field, field.replace(/^\uFEFF/, '').trim());
  }
  return fieldMap;
}

/**
 * Crea una copia de la fila usando los nombres de columna normalizados.
 * @param {unknown} row Fila devuelta por PapaParse.
 * @param {Map<string, string>} fieldMap Mapa de encabezados.
 * @returns {Object|null} Fila normalizada o null si no es un objeto.
 */
function normalizeRow(row, fieldMap) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return null;
  }

  const normalized = {};
  for (const [originalField, fieldName] of fieldMap) {
    normalized[fieldName] = row[originalField];
  }
  return normalized;
}

/**
 * Construye el objeto de un juego nuevo a partir de una fila del CSV.
 * @param {Object} row Fila normalizada.
 * @param {string} bggId Identificador de BGG.
 * @returns {Object} Juego listo para insertar.
 */
function createGame(row, bggId) {
  const isOwned = toText(row.own) === '1';

  return {
    bggId,
    title: toText(row.objectname),
    ownership: isOwned ? 'owned' : 'played_elsewhere',
    ownerNote: isOwned ? 'Mío' : '',
    bggBaselinePlays: toInt(row.numplays, 0),
    minPlayers: toInt(row.minplayers, 1),
    maxPlayers: toInt(row.maxplayers, 1),
    playingTime: toInt(row.playingtime, 0),
  };
}

/**
 * Aplica los campos gestionados por BGG sobre una copia del juego existente.
 * @param {Object} game Juego actual.
 * @param {Object} row Fila normalizada.
 * @returns {Object} Copia actualizada del juego.
 */
function updateGame(game, row) {
  const updated = {
    ...game,
    title: toText(row.objectname),
    bggBaselinePlays: toInt(row.numplays, 0),
    minPlayers: toInt(row.minplayers, 1),
    maxPlayers: toInt(row.maxplayers, 1),
    playingTime: toInt(row.playingtime, 0),
  };

  if (toText(row.own) === '1') {
    updated.ownership = 'owned';
  }

  return updated;
}

/**
 * Importa y fusiona un CSV de la colección de BGG en el estado actual.
 *
 * Los juegos existentes conservan su posición y sus campos propios; los nuevos
 * se agregan al final en el orden del CSV. La operación es idempotente y no
 * persiste ni muta el estado recibido.
 *
 * @param {File|Blob|string} file Archivo CSV o su contenido como texto.
 * @param {unknown} currentState Estado actual de la aplicación.
 * @returns {Promise<{ state: LudotecaState, stats: MergeStats }>} Estado
 * fusionado y resumen de la importación.
 * @throws {Error} Si PapaParse no está disponible, el CSV es inválido o no
 * contiene filas válidas.
 */
export async function mergeBggCsv(file, currentState) {
  const Papa = globalThis.Papa;
  if (!Papa || typeof Papa.parse !== 'function') {
    throw new Error(
      'PapaParse no está disponible. Verificá que la librería se haya cargado antes de importar el CSV.'
    );
  }

  const results = await new Promise((resolve, reject) => {
    try {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: resolve,
        error(error) {
          reject(
            new Error('No se pudo leer el archivo CSV de BGG.', { cause: error })
          );
        },
      });
    } catch (error) {
      reject(
        new Error('No se pudo iniciar el parseo del CSV de BGG.', {
          cause: error,
        })
      );
    }
  });

  if (!results || typeof results !== 'object') {
    throw new Error('PapaParse no devolvió un resultado válido para el CSV.');
  }

  const fields =
    results.meta && Array.isArray(results.meta.fields)
      ? results.meta.fields
      : [];
  const fieldMap = buildFieldMap(fields);
  const availableFields = new Set(fieldMap.values());
  const missingFields = REQUIRED_FIELDS.filter(
    (field) => !availableFields.has(field)
  );

  if (missingFields.length > 0) {
    throw new Error(
      `El CSV no contiene las columnas obligatorias: ${missingFields.join(', ')}.`
    );
  }

  if (Array.isArray(results.errors) && results.errors.length > 0) {
    console.warn(
      `[MiLudoteca] PapaParse informó ${results.errors.length} error(es) de fila; se continúa con la importación.`
    );
  }

  const rows = Array.isArray(results.data) ? results.data : [];
  const rowsByBggId = new Map();
  let skipped = 0;

  for (const rawRow of rows) {
    const row = normalizeRow(rawRow, fieldMap);
    const bggId = row ? toText(row.objectid) : '';

    if (!bggId) {
      skipped += 1;
      continue;
    }

    // Si el mismo bggId aparece varias veces, prevalece la última fila.
    rowsByBggId.set(bggId, row);
  }

  if (rowsByBggId.size === 0) {
    throw new Error(
      'El CSV no contiene filas válidas con un identificador "objectid".'
    );
  }

  const state = normalizeState(currentState);
  const games = [...state.games];
  const indexByBggId = new Map();

  games.forEach((game, index) => {
    if (!game || typeof game !== 'object') {
      return;
    }
    const bggId = toText(game.bggId);
    if (bggId && !indexByBggId.has(bggId)) {
      indexByBggId.set(bggId, index);
    }
  });

  let added = 0;
  let updated = 0;

  for (const [bggId, row] of rowsByBggId) {
    const existingIndex = indexByBggId.get(bggId);

    if (existingIndex === undefined) {
      indexByBggId.set(bggId, games.length);
      games.push(createGame(row, bggId));
      added += 1;
      continue;
    }

    games[existingIndex] = updateGame(games[existingIndex], row);
    updated += 1;
  }

  return {
    state: {
      version: state.version,
      lastSync: state.lastSync,
      games,
      plays: [...state.plays],
    },
    stats: { added, updated, skipped },
  };
}
