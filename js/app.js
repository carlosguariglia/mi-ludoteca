/**
 * MiLudoteca · lógica de la interfaz.
 *
 * Orquesta el estado local (localStorage), la sincronización manual con un
 * GitHub Gist y la importación de la colección CSV de BGG. Toda mutación se
 * persiste con saveLocalState(); los datos se pintan sin innerHTML.
 */

import {
  getAuthConfig,
  loadLocalState,
  pullFromGist,
  pushToGist,
  saveAuthConfig,
  saveLocalState,
} from './services/gistSync.js';
import { mergeBggCsv } from './services/csvParser.js';
import './components/gameCard.js';

const TOAST_DURATION = 4000;

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
});
const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const relativeFormatter = new Intl.RelativeTimeFormat('es', {
  numeric: 'auto',
});

let state = { version: 1, lastSync: null, games: [], plays: [] };
const filters = { ownership: 'all', players: null };
let syncing = false;
let busy = false;
let auth = { token: '', gistId: '' };
let syncError = '';
let activeGameId = null;
let toastTimer = null;
let els = {};

/**
 * Inicializa el estado, guarda referencias al DOM y conecta los eventos.
 * @returns {void}
 */
function init() {
  cacheElements();
  auth = getAuthConfig();
  state = loadLocalState();
  bindEvents();
  renderSyncStatus();
  render();
}

/**
 * Cachea los elementos del contrato de index.html.
 * @returns {void}
 */
function cacheElements() {
  els = {
    syncStatus: document.getElementById('sync-status'),
    syncStatusText: document.getElementById('sync-status-text'),
    syncLast: document.getElementById('sync-last'),
    btnSyncConfig: document.getElementById('btn-sync-config'),
    btnPull: document.getElementById('btn-pull'),
    btnPush: document.getElementById('btn-push'),
    playersInput: document.getElementById('players-filter'),
    btnPlayersClear: document.getElementById('btn-players-clear'),
    btnImportCsv: document.getElementById('btn-import-csv'),
    importCsvInput: document.getElementById('import-csv-input'),
    btnAddBorrowed: document.getElementById('btn-add-borrowed'),
    resultsSummary: document.getElementById('results-summary'),
    gamesGrid: document.getElementById('games-grid'),
    emptyMessage: document.getElementById('empty-message'),
    emptyTitle: document.getElementById('empty-title'),
    emptyText: document.getElementById('empty-text'),
    dialogBorrowed: document.getElementById('dialog-borrowed'),
    formBorrowed: document.getElementById('form-borrowed'),
    borrowedTitle: document.getElementById('borrowed-title'),
    borrowedOwner: document.getElementById('borrowed-owner'),
    borrowedMin: document.getElementById('borrowed-min'),
    borrowedMax: document.getElementById('borrowed-max'),
    borrowedTime: document.getElementById('borrowed-time'),
    borrowedError: document.getElementById('borrowed-error'),
    dialogPlay: document.getElementById('dialog-play'),
    formPlay: document.getElementById('form-play'),
    playGameTitle: document.getElementById('play-game-title'),
    playDate: document.getElementById('play-date'),
    playPlayers: document.getElementById('play-players'),
    playNotes: document.getElementById('play-notes'),
    playError: document.getElementById('play-error'),
    dialogConfig: document.getElementById('dialog-config'),
    formConfig: document.getElementById('form-config'),
    configToken: document.getElementById('config-token'),
    configGistId: document.getElementById('config-gist-id'),
    configError: document.getElementById('config-error'),
    toast: document.getElementById('toast'),
    totalGames: document.getElementById('total-games'),
    totalPlays: document.getElementById('total-plays'),
    filterButtons: Array.from(document.querySelectorAll('[data-filter]')),
    closeDialogButtons: Array.from(
      document.querySelectorAll('[data-close-dialog]')
    ),
  };
}

/**
 * Conecta todos los listeners de la interfaz.
 * @returns {void}
 */
function bindEvents() {
  for (const button of els.filterButtons) {
    button.addEventListener('click', () => {
      filters.ownership = button.dataset.filter || 'all';
      render();
    });
  }

  els.playersInput.addEventListener('input', handlePlayersFilter);
  els.btnPlayersClear.addEventListener('click', clearPlayersFilter);
  els.btnAddBorrowed.addEventListener('click', openBorrowedDialog);

  els.btnImportCsv.addEventListener('click', () => {
    els.importCsvInput.click();
  });
  els.importCsvInput.addEventListener('change', handleCsvImport);

  els.gamesGrid.addEventListener('add-play', handleAddPlayEvent);

  els.formBorrowed.addEventListener('submit', handleBorrowedSubmit);
  els.formPlay.addEventListener('submit', handlePlaySubmit);
  els.formConfig.addEventListener('submit', handleConfigSubmit);

  els.btnSyncConfig.addEventListener('click', openConfigDialog);
  els.btnPull.addEventListener('click', handlePull);
  els.btnPush.addEventListener('click', handlePush);

  for (const button of els.closeDialogButtons) {
    button.addEventListener('click', () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      if (dialog && dialog.open) {
        dialog.close();
      }
    });
  }
}

/**
 * Filtra los juegos según propiedad y cantidad de jugadores.
 * @returns {Array<Object>} Juegos visibles sin mutar el estado.
 */
function applyFilters() {
  return state.games.filter((game) => {
    if (!game || typeof game !== 'object') {
      return false;
    }

    if (
      filters.ownership !== 'all' &&
      game.ownership !== filters.ownership
    ) {
      return false;
    }

    if (filters.players !== null) {
      const min = normalizePlayers(game.minPlayers);
      let max = normalizePlayers(game.maxPlayers);
      if (max < min) {
        max = min;
      }
      if (filters.players < min || filters.players > max) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Actualiza el input y el estado del filtro de jugadores.
 * @returns {void}
 */
function handlePlayersFilter() {
  const parsed = Number.parseInt(els.playersInput.value, 10);
  filters.players = Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  render();
}

/**
 * Limpia el filtro por cantidad de jugadores.
 * @returns {void}
 */
function clearPlayersFilter() {
  els.playersInput.value = '';
  filters.players = null;
  render();
  els.playersInput.focus();
}

/**
 * Sincroniza el atributo aria-pressed de los filtros de propiedad.
 * @returns {void}
 */
function updateFilterButtons() {
  for (const button of els.filterButtons) {
    const isActive = button.dataset.filter === filters.ownership;
    button.setAttribute('aria-pressed', String(isActive));
    button.classList.toggle('is-active', isActive);
  }
}

/**
 * Reconstruye la grilla, los totales y el estado vacío.
 * @returns {void}
 */
function render() {
  updateFilterButtons();

  const visibleGames = applyFilters();
  const localPlayCounts = buildLocalPlayCountMap();
  const fragment = document.createDocumentFragment();
  let visiblePlays = 0;

  for (const game of visibleGames) {
    const playCount = getTotalPlays(game, localPlayCounts);
    visiblePlays += playCount;

    const card = document.createElement('game-card');
    card.game = game;
    card.playCount = playCount;
    fragment.append(card);
  }

  els.gamesGrid.replaceChildren(fragment);
  updateEmptyState(visibleGames);
  updateSummary(visibleGames.length, visiblePlays);
  updateTotals();
}

/**
 * Muestra u oculta el estado vacío con el mensaje adecuado.
 * @param {Array<Object>} visibleGames Juegos que pasaron los filtros.
 * @returns {void}
 */
function updateEmptyState(visibleGames) {
  const hasGames = state.games.length > 0;
  const hasVisibleGames = visibleGames.length > 0;

  els.gamesGrid.hidden = !hasVisibleGames;
  els.emptyMessage.hidden = hasVisibleGames;

  if (hasVisibleGames) {
    return;
  }

  if (!hasGames) {
    els.emptyTitle.textContent = 'Todavía no cargaste juegos';
    els.emptyText.textContent =
      'Importá tu colección de BGG o agregá un juego prestado para empezar.';
  } else {
    els.emptyTitle.textContent = 'No hay juegos que coincidan';
    els.emptyText.textContent =
      'Probá con otra propiedad, cambiá la cantidad de jugadores o limpiá el filtro.';
  }
}

/**
 * Escribe el resumen accesible de la vista actual.
 * @param {number} visibleCount Cantidad de juegos visibles.
 * @param {number} visiblePlays Partidas de los juegos visibles.
 * @returns {void}
 */
function updateSummary(visibleCount, visiblePlays) {
  const playWord = visiblePlays === 1 ? 'partida' : 'partidas';
  els.resultsSummary.textContent =
    `Mostrando ${visibleCount} de ${state.games.length} juegos · ` +
    `${visiblePlays} ${playWord}`;
}

/**
 * Actualiza los totales del footer.
 * @returns {void}
 */
function updateTotals() {
  let totalPlays = state.plays.length;

  for (const game of state.games) {
    if (!game || typeof game !== 'object') {
      continue;
    }
    totalPlays += toNonNegativeInt(game.bggBaselinePlays, 0);
  }

  els.totalGames.textContent = String(state.games.length);
  els.totalPlays.textContent = String(totalPlays);
}

/**
 * Construye un mapa de partidas locales por bggId.
 * @returns {Map<string, number>} Cantidad de plays locales por juego.
 */
function buildLocalPlayCountMap() {
  const counts = new Map();

  for (const play of state.plays) {
    if (!play || typeof play !== 'object' || play.bggId === undefined) {
      continue;
    }
    const key = String(play.bggId);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
}

/**
 * Calcula el total visible de un juego: base de BGG + partidas locales.
 * @param {Object} game Juego.
 * @param {Map<string, number>} localPlayCounts Partidas locales por bggId.
 * @returns {number} Total de partidas.
 */
function getTotalPlays(game, localPlayCounts) {
  const baseline = toNonNegativeInt(game.bggBaselinePlays, 0);
  const local = localPlayCounts.get(String(game.bggId)) || 0;
  return baseline + local;
}

/**
 * Busca un juego por su bggId.
 * @param {string|number} bggId Identificador del juego.
 * @returns {Object|undefined} Juego encontrado.
 */
function findGameByBggId(bggId) {
  const key = String(bggId);
  return state.games.find(
    (game) => game && String(game.bggId) === key
  );
}

/**
 * Abre el diálogo de partida para un juego.
 * @param {Object} game Juego sobre el que se registra la partida.
 * @returns {void}
 */
function openPlayDialog(game) {
  if (!game) {
    return;
  }

  activeGameId = game.bggId;
  els.playGameTitle.textContent =
    typeof game.title === 'string' && game.title.trim()
      ? game.title.trim()
      : 'Juego sin título';
  els.playDate.value = todayLocalISO();
  els.playPlayers.value = String(normalizePlayers(game.minPlayers));
  els.playNotes.value = '';
  setFormError(els.playError, '');

  if (!els.dialogPlay.open) {
    els.dialogPlay.showModal();
  }
  els.playDate.focus();
}

/**
 * Atiende el CustomEvent emitido por <game-card>.
 * @param {CustomEvent} event Evento add-play.
 * @returns {void}
 */
function handleAddPlayEvent(event) {
  const bggId = event.detail ? event.detail.bggId : null;
  if (bggId === null || bggId === undefined) {
    return;
  }

  const game = findGameByBggId(bggId);
  if (game) {
    openPlayDialog(game);
  }
}

/**
 * Abre y limpia el diálogo de alta de juego prestado.
 * @returns {void}
 */
function openBorrowedDialog() {
  els.formBorrowed.reset();
  setFormError(els.borrowedError, '');

  if (!els.dialogBorrowed.open) {
    els.dialogBorrowed.showModal();
  }
  els.borrowedTitle.focus();
}

/**
 * Abre el diálogo de configuración sin exponer el token guardado.
 * @returns {void}
 */
function openConfigDialog() {
  const config = getAuthConfig();
  els.configGistId.value = config.gistId;
  els.configToken.value = '';
  setFormError(els.configError, '');

  if (!els.dialogConfig.open) {
    els.dialogConfig.showModal();
  }
  els.configToken.focus();
}

/**
 * Valida y guarda el alta manual de un juego prestado.
 * @param {SubmitEvent} event Envío del formulario.
 * @returns {void}
 */
function handleBorrowedSubmit(event) {
  event.preventDefault();
  setFormError(els.borrowedError, '');

  const title = els.borrowedTitle.value.trim();
  const ownerNote = els.borrowedOwner.value.trim();
  const minPlayers = toPositiveInt(els.borrowedMin.value, 1);
  const maxPlayers = toPositiveInt(els.borrowedMax.value, 1);
  const playingTime = toNonNegativeInt(els.borrowedTime.value, 0);

  if (!title) {
    setFormError(els.borrowedError, 'El título es obligatorio.');
    els.borrowedTitle.focus();
    return;
  }

  if (maxPlayers < minPlayers) {
    setFormError(
      els.borrowedError,
      'La cantidad máxima de jugadores debe ser mayor o igual a la mínima.'
    );
    els.borrowedMax.focus();
    return;
  }

  const game = {
    bggId: uid('local'),
    title,
    ownership: 'borrowed',
    ownerNote,
    bggBaselinePlays: 0,
    minPlayers,
    maxPlayers,
    playingTime,
  };

  if (!commitState({ ...state, games: [...state.games, game] })) {
    setFormError(
      els.borrowedError,
      'No se pudo guardar el juego en este navegador.'
    );
    return;
  }

  els.dialogBorrowed.close();
  els.formBorrowed.reset();
  render();
  showToast(`Se agregó "${title}" a tu ludoteca.`, 'success');
}

/**
 * Valida y guarda una partida nueva.
 * @param {SubmitEvent} event Envío del formulario.
 * @returns {void}
 */
function handlePlaySubmit(event) {
  event.preventDefault();
  setFormError(els.playError, '');

  const game = findGameByBggId(activeGameId);
  if (!game) {
    setFormError(
      els.playError,
      'No se encontró el juego. Cerrá el diálogo e intentá de nuevo.'
    );
    return;
  }

  const date = els.playDate.value.trim();
  const players = Number.parseInt(els.playPlayers.value, 10);
  const notes = els.playNotes.value.trim();

  if (!isValidDateOnly(date)) {
    setFormError(els.playError, 'Elegí una fecha válida.');
    els.playDate.focus();
    return;
  }

  if (!Number.isFinite(players) || players < 1) {
    setFormError(
      els.playError,
      'La cantidad de jugadores debe ser un número mayor o igual a 1.'
    );
    els.playPlayers.focus();
    return;
  }

  if (notes.length > 500) {
    setFormError(els.playError, 'Las notas no pueden superar los 500 caracteres.');
    els.playNotes.focus();
    return;
  }

  const play = {
    id: uid(),
    bggId: game.bggId,
    date,
    players,
    notes,
  };

  if (!commitState({ ...state, plays: [...state.plays, play] })) {
    setFormError(
      els.playError,
      'No se pudo guardar la partida en este navegador.'
    );
    return;
  }

  els.dialogPlay.close();
  render();
  showToast(`Partida de "${game.title || 'el juego'}" registrada.`, 'success');
}

/**
 * Valida y persiste la configuración del Gist.
 * @param {SubmitEvent} event Envío del formulario.
 * @returns {void}
 */
function handleConfigSubmit(event) {
  event.preventDefault();
  setFormError(els.configError, '');

  try {
    saveAuthConfig(els.configToken.value, els.configGistId.value);
    auth = getAuthConfig();
    syncError = '';
    els.configToken.value = '';
    els.dialogConfig.close();
    renderSyncStatus();
    showToast(
      'Configuración guardada. Ya podés bajar o subir tu Gist.',
      'success'
    );
  } catch (error) {
    console.error('[MiLudoteca] No se pudo guardar la configuración.', error);
    setFormError(
      els.configError,
      error instanceof Error
        ? error.message
        : 'No se pudo guardar la configuración.'
    );
  }
}

/**
 * Importa un CSV de BGG y persiste el estado fusionado.
 * @param {Event} event Cambio del input de archivo.
 * @returns {Promise<void>}
 */
async function handleCsvImport(event) {
  const input = event.currentTarget;
  const file = input.files && input.files[0];

  if (!file) {
    return;
  }

  if (syncing) {
    input.value = '';
    showToast('Esperá a que termine la sincronización antes de importar.', 'info');
    return;
  }

  if (busy) {
    input.value = '';
    return;
  }

  busy = true;
  els.btnImportCsv.disabled = true;
  els.btnImportCsv.textContent = 'Importando…';
  els.btnImportCsv.setAttribute('aria-busy', 'true');
  renderSyncStatus();

  try {
    const result = await mergeBggCsv(file, state);

    if (!commitState(result.state)) {
      return;
    }

    render();

    const { added, updated, skipped } = result.stats;
    let summary = `${added} nuevos, ${updated} actualizados`;
    if (skipped > 0) {
      summary += `, ${skipped} omitidos`;
    }
    showToast(`CSV importado: ${summary}.`, 'success');
  } catch (error) {
    console.error('[MiLudoteca] No se pudo importar el CSV de BGG.', error);
    const detail =
      error instanceof Error ? error.message : 'error inesperado al leerlo';
    showToast(`No se pudo importar el CSV: ${detail}`, 'error');
  } finally {
    input.value = '';
    busy = false;
    els.btnImportCsv.disabled = false;
    els.btnImportCsv.textContent = 'Importar CSV';
    els.btnImportCsv.removeAttribute('aria-busy');
    renderSyncStatus();
  }
}

/**
 * Baja el estado desde el Gist, con confirmación previa.
 * @returns {Promise<void>}
 */
async function handlePull() {
  if (!hasAuth()) {
    showToast('Configurá el token y el gistId antes de bajar cambios.', 'error');
    return;
  }

  if (syncing || busy) {
    return;
  }

  const confirmed = window.confirm(
    '¿Bajar el estado desde el Gist?\n\n' +
      'Se reemplazará TODO el estado local (juegos y partidas) con el contenido ' +
      'remoto. Las ediciones locales que no hayas subido se perderán.'
  );
  if (!confirmed) {
    return;
  }

  syncing = true;
  syncError = '';
  renderSyncStatus();

  try {
    state = await pullFromGist();
    render();
    showToast('Estado bajado desde el Gist.', 'success');
  } catch (error) {
    console.error('[MiLudoteca] Error al bajar el Gist.', error);
    syncError =
      error instanceof Error ? error.message : 'Error inesperado de GitHub.';
    showToast(`No se pudo bajar el Gist: ${syncError}`, 'error');
  } finally {
    syncing = false;
    renderSyncStatus();
  }
}

/**
 * Sube el estado al Gist, con confirmación previa.
 * @returns {Promise<void>}
 */
async function handlePush() {
  if (!hasAuth()) {
    showToast('Configurá el token y el gistId antes de subir cambios.', 'error');
    return;
  }

  if (syncing || busy) {
    return;
  }

  const confirmed = window.confirm(
    '¿Subir el estado al Gist?\n\n' +
      'Se reemplazará el contenido remoto con el estado local actual. Los ' +
      'cambios hechos en otro dispositivo que no hayas bajado se perderán.'
  );
  if (!confirmed) {
    return;
  }

  syncing = true;
  syncError = '';
  renderSyncStatus();

  try {
    state = await pushToGist(state);
    render();
    showToast('Estado subido al Gist.', 'success');
  } catch (error) {
    console.error('[MiLudoteca] Error al subir el Gist.', error);
    syncError =
      error instanceof Error ? error.message : 'Error inesperado de GitHub.';
    showToast(`No se pudo subir el Gist: ${syncError}`, 'error');
  } finally {
    syncing = false;
    renderSyncStatus();
  }
}

/**
 * Refleja el estado de sincronización en el header y habilita los botones.
 * @returns {void}
 */
function renderSyncStatus() {
  const configured = hasAuth();
  let dataState = 'unconfigured';
  let text = 'Sin configurar';
  let detail = 'Configurá el token y el gistId para sincronizar.';
  let detailTitle = '';

  if (syncing) {
    dataState = 'syncing';
    text = 'Sincronizando…';
    detail = 'Contactando a GitHub…';
  } else if (syncError) {
    dataState = 'error';
    text = 'Error de sincronización';
    detail = syncError;
    detailTitle = syncError;
  } else if (configured && state.lastSync) {
    dataState = 'synced';
    text = 'Sincronizado';
    detail = `Última sync: ${relativeTime(state.lastSync)}`;
    detailTitle = `Última sync: ${formatDate(state.lastSync, true)}`;
  } else if (configured) {
    dataState = 'ready';
    text = 'Configurado';
    detail = 'Todavía no sincronizaste.';
  }

  els.syncStatus.dataset.state = dataState;
  els.syncStatusText.textContent = text;
  els.syncLast.textContent = detail;

  if (detailTitle) {
    els.syncLast.title = detailTitle;
  } else {
    els.syncLast.removeAttribute('title');
  }

  const disabled = !configured || syncing || busy;
  els.btnPull.disabled = disabled;
  els.btnPush.disabled = disabled;

  if (!configured) {
    els.btnPull.title = 'Configurá el Gist para bajar cambios';
    els.btnPush.title = 'Configurá el Gist para subir cambios';
  } else if (syncing || busy) {
    els.btnPull.title = 'Sincronización en curso';
    els.btnPush.title = 'Sincronización en curso';
  } else {
    els.btnPull.title = 'Bajar cambios desde el Gist (reemplaza el estado local)';
    els.btnPush.title = 'Subir cambios al Gist (reemplaza el estado remoto)';
  }
}

/**
 * Persiste un estado completo y actualiza el módulo solo si tuvo éxito.
 * @param {Object} nextState Estado a guardar.
 * @returns {boolean} true si se guardó correctamente.
 */
function commitState(nextState) {
  try {
    state = saveLocalState(nextState);
    return true;
  } catch (error) {
    console.error('[MiLudoteca] No se pudo guardar el estado local.', error);
    showToast('No se pudo guardar el estado en este navegador.', 'error');
    return false;
  }
}

/**
 * Muestra un toast accesible que se cierra solo.
 * @param {string} message Mensaje a mostrar.
 * @param {'info'|'success'|'error'} [type] Tipo visual.
 * @returns {void}
 */
function showToast(message, type = 'info') {
  if (!els.toast) {
    return;
  }

  els.toast.textContent = message;
  els.toast.dataset.type = type;
  els.toast.classList.add('is-visible');

  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove('is-visible');
    toastTimer = null;
  }, TOAST_DURATION);
}

/**
 * Indica si hay token y gistId configurados.
 * @returns {boolean} true si la sincronización está disponible.
 */
function hasAuth() {
  return Boolean(auth.token && auth.gistId);
}

/**
 * Escribe o limpia el error inline de un formulario.
 * @param {HTMLElement} element Nodo de error.
 * @param {string} message Mensaje; vacío para ocultarlo.
 * @returns {void}
 */
function setFormError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

/**
 * Convierte un valor en entero positivo con respaldo.
 * @param {unknown} value Valor a interpretar.
 * @param {number} fallback Valor por defecto.
 * @returns {number} Entero mayor o igual a 1.
 */
function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

/**
 * Convierte un valor en entero no negativo con respaldo.
 * @param {unknown} value Valor a interpretar.
 * @param {number} fallback Valor por defecto.
 * @returns {number} Entero mayor o igual a 0.
 */
function toNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Normaliza la cantidad de jugadores de un juego.
 * @param {unknown} value Valor a interpretar.
 * @returns {number} Entero mayor o igual a 1.
 */
function normalizePlayers(value) {
  return toPositiveInt(value, 1);
}

/**
 * Convierte un string YYYY-MM-DD en Date local, o un ISO completo en Date.
 * @param {unknown} value Fecha en string, número o Date.
 * @returns {Date|null} Fecha válida o null.
 */
function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formatea una fecha en español, opcionalmente con hora.
 * @param {unknown} value Fecha a formatear.
 * @param {boolean} [withTime] Incluir la hora.
 * @returns {string} Fecha legible o un guion si es inválida.
 */
function formatDate(value, withTime = false) {
  const date = toDate(value);
  if (!date) {
    return '—';
  }
  return (withTime ? dateTimeFormatter : dateFormatter).format(date);
}

/**
 * Describe una fecha en formato relativo ("hace 5 minutos").
 * @param {unknown} value Fecha a describir.
 * @returns {string} Texto relativo o fecha absoluta para valores antiguos.
 */
function relativeTime(value) {
  const date = toDate(value);
  if (!date) {
    return 'fecha desconocida';
  }

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(diffSeconds);

  if (absoluteSeconds < 45) {
    return 'recién';
  }
  if (absoluteSeconds < 3600) {
    return relativeFormatter.format(Math.round(diffSeconds / 60), 'minute');
  }
  if (absoluteSeconds < 86400) {
    return relativeFormatter.format(Math.round(diffSeconds / 3600), 'hour');
  }
  if (absoluteSeconds < 604800) {
    return relativeFormatter.format(Math.round(diffSeconds / 86400), 'day');
  }
  return formatDate(value);
}

/**
 * Devuelve la fecha de hoy en formato YYYY-MM-DD según la hora local.
 * @returns {string} Fecha local.
 */
function todayLocalISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Valida que un texto sea una fecha real en formato YYYY-MM-DD.
 * @param {string} value Texto a validar.
 * @returns {boolean} true si representa una fecha válida.
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
 * Genera un identificador único legible.
 *
 * Con prefijo usa base36 para el timestamp (p. ej. bggIds locales); sin prefijo
 * usa milisegundos decimales (p. ej. ids de partidas).
 *
 * @param {string} [prefix] Prefijo opcional.
 * @returns {string} Identificador único.
 */
function uid(prefix = '') {
  const random = Math.random().toString(36).slice(2, 8);
  if (prefix) {
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }
  return `${Date.now()}-${random}`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
