/**
 * WebComponent <game-card> de MiLudoteca.
 *
 * Recibe un juego y su total de partidas como propiedades, renderiza una tarjeta
 * accesible y emite `add-play` (bubbles + composed) cuando se pide registrar una
 * partida. No conoce servicios, localStorage ni el estado global.
 */

const OWNERSHIP_LABELS = {
  owned: 'Propio',
  borrowed: 'Prestado',
  played_elsewhere: 'Jugado',
};

const OWNERSHIP_CLASSES = {
  owned: 'owned',
  borrowed: 'borrowed',
  played_elsewhere: 'played',
};

const CARD_STYLES = `
  :host {
    display: block;
    height: 100%;
    min-width: 0;
    color: var(--text, #1f2937);
    font-family: inherit;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    height: 100%;
    min-height: 224px;
    padding: 1rem;
    border: 1px solid var(--border, #dfe3ea);
    border-radius: var(--radius, 14px);
    background: var(--surface, #ffffff);
    box-shadow: var(--shadow-soft, 0 2px 10px rgba(15, 23, 42, 0.05));
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  }

  @media (hover: hover) {
    .card:hover {
      transform: translateY(-2px);
      border-color: var(--primary, #4f46e5);
      box-shadow: var(--shadow, 0 18px 48px rgba(15, 23, 42, 0.1));
    }
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.55rem;
  }

  .title {
    display: -webkit-box;
    min-height: 2.6em;
    margin: 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow-wrap: anywhere;
    font-size: 1.02rem;
    font-weight: 750;
    letter-spacing: -0.012em;
    line-height: 1.3;
  }

  .badge {
    display: inline-flex;
    flex: none;
    align-items: center;
    max-width: 46%;
    padding: 0.16rem 0.5rem;
    overflow: hidden;
    border: 1px solid;
    border-radius: 999px;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.045em;
    line-height: 1.4;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .badge--owned {
    border-color: var(--badge-owned-border, #86efac);
    background: var(--badge-owned-bg, #dcfce7);
    color: var(--badge-owned-text, #14532d);
  }

  .badge--borrowed {
    border-color: var(--badge-borrowed-border, #fcd34d);
    background: var(--badge-borrowed-bg, #fef3c7);
    color: var(--badge-borrowed-text, #78350f);
  }

  .badge--played {
    border-color: var(--badge-played-border, #93c5fd);
    background: var(--badge-played-bg, #dbeafe);
    color: var(--badge-played-text, #1e3a8a);
  }

  .badge--unknown {
    border-color: var(--badge-unknown-border, #cbd5e1);
    background: var(--badge-unknown-bg, #e5e7eb);
    color: var(--badge-unknown-text, #374151);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.75rem;
    margin: 0;
    padding: 0;
    color: var(--muted, #5f6b7a);
    font-size: 0.81rem;
    list-style: none;
  }

  .meta li {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    min-width: 0;
  }

  .meta li::before {
    width: 5px;
    height: 5px;
    flex: none;
    border-radius: 50%;
    background: currentColor;
    content: '';
    opacity: 0.55;
  }

  .owner-note {
    margin: 0;
    padding: 0.42rem 0.58rem;
    overflow: hidden;
    border-left: 3px solid var(--badge-borrowed-border, #fcd34d);
    border-radius: 0 8px 8px 0;
    background: var(--surface-soft, #f8fafc);
    color: var(--muted, #5f6b7a);
    font-size: 0.77rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: auto;
    padding-top: 0.7rem;
    border-top: 1px solid var(--border, #dfe3ea);
  }

  .plays {
    color: var(--muted, #5f6b7a);
    font-size: 0.79rem;
    font-weight: 650;
  }

  .play-btn {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 0.8rem;
    border: 1px solid var(--primary, #4f46e5);
    border-radius: 10px;
    background: var(--primary, #4f46e5);
    color: var(--primary-contrast, #ffffff);
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 750;
    line-height: 1.1;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease,
      transform 0.15s ease;
  }

  @media (hover: hover) {
    .play-btn:hover {
      border-color: var(--primary-strong, #4338ca);
      background: var(--primary-strong, #4338ca);
    }
  }

  .play-btn:active {
    transform: translateY(1px);
  }

  .play-btn:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary, #4f46e5) 58%, transparent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .play-btn {
      transition: none;
    }

    .card:hover {
      transform: none;
    }
  }
`;

/**
 * Crea un elemento HTML con clase y texto opcionales.
 * @param {string} tag Nombre de la etiqueta.
 * @param {string} [className] Clases CSS.
 * @param {string} [text] Texto seguro para el nodo.
 * @returns {HTMLElement} Elemento creado.
 */
function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

/**
 * Convierte un valor en entero positivo, con respaldo.
 * @param {unknown} value Valor a interpretar.
 * @param {number} fallback Valor por defecto.
 * @returns {number} Entero mayor o igual a 1.
 */
function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

/**
 * Convierte un valor en entero no negativo, con respaldo.
 * @param {unknown} value Valor a interpretar.
 * @param {number} fallback Valor por defecto.
 * @returns {number} Entero mayor o igual a 0.
 */
function toNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

class GameCard extends HTMLElement {
  constructor() {
    super();

    this._game = null;
    this._playCount = 0;

    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CARD_STYLES;
    root.append(style);

    this._container = createElement('div', 'card-container');
    root.append(this._container);
  }

  connectedCallback() {
    this._render();
  }

  /**
   * Juego a mostrar. Se re-renderiza al asignarlo.
   * @param {Object|null} value Juego del estado de MiLudoteca.
   */
  set game(value) {
    this._game =
      value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    this._render();
  }

  get game() {
    return this._game;
  }

  /**
   * Total de partidas mostrado (base de BGG + locales).
   * @param {number} value Cantidad de partidas.
   */
  set playCount(value) {
    const parsed = Number.parseInt(value, 10);
    this._playCount = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    this._render();
  }

  get playCount() {
    return this._playCount;
  }

  /**
   * Reconstruye la tarjeta dentro del shadow root usando solo nodos y textContent.
   * @returns {void}
   */
  _render() {
    this._container.replaceChildren();

    const game = this._game;
    if (!game) {
      return;
    }

    const title =
      typeof game.title === 'string' && game.title.trim()
        ? game.title.trim()
        : 'Juego sin título';
    const ownership = Object.prototype.hasOwnProperty.call(
      OWNERSHIP_LABELS,
      game.ownership
    )
      ? game.ownership
      : 'unknown';
    const ownershipLabel = OWNERSHIP_LABELS[ownership] || 'Sin clasificar';
    const ownershipClass = OWNERSHIP_CLASSES[ownership] || 'unknown';

    const minPlayers = toPositiveInt(game.minPlayers, 1);
    const maxPlayers = toPositiveInt(game.maxPlayers, 1);
    const lowest = Math.min(minPlayers, maxPlayers);
    const highest = Math.max(minPlayers, maxPlayers);
    const playersText =
      lowest === highest
        ? `${lowest} ${lowest === 1 ? 'jugador' : 'jugadores'}`
        : `${lowest}–${highest} jugadores`;
    const playingTime = toNonNegativeInt(game.playingTime, 0);

    const card = createElement('article', 'card');
    card.setAttribute('aria-label', title);

    const top = createElement('div', 'card-top');
    const titleElement = createElement('h3', 'title', title);
    titleElement.title = title;
    const badge = createElement(
      'span',
      `badge badge--${ownershipClass}`,
      ownershipLabel
    );
    top.append(titleElement, badge);

    const meta = createElement('ul', 'meta');
    meta.append(createElement('li', '', playersText));
    if (playingTime > 0) {
      meta.append(createElement('li', '', `${playingTime} min`));
    }

    card.append(top, meta);

    const ownerNote =
      typeof game.ownerNote === 'string' ? game.ownerNote.trim() : '';
    if (ownerNote) {
      const note = createElement('p', 'owner-note', ownerNote);
      note.title = ownerNote;
      card.append(note);
    }

    const bottom = createElement('div', 'card-bottom');
    const playsText =
      this._playCount === 1 ? '1 partida' : `${this._playCount} partidas`;
    const plays = createElement('span', 'plays', playsText);

    const playButton = createElement('button', 'play-btn', '+1 Partida');
    playButton.type = 'button';
    playButton.setAttribute('aria-label', `Registrar una partida de ${title}`);
    playButton.addEventListener('click', () => {
      this.dispatchEvent(
        new CustomEvent('add-play', {
          detail: { bggId: game.bggId },
          bubbles: true,
          composed: true,
        })
      );
    });

    bottom.append(plays, playButton);
    card.append(bottom);
    this._container.append(card);
  }
}

if (!customElements.get('game-card')) {
  customElements.define('game-card', GameCard);
}
