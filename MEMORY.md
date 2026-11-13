# Project Memory: MiLudoteca

## 1. Visión y Arquitectura
- **Nombre de la App:** MiLudoteca
- **Propósito:** Control personal de juegos de mesa (propios, prestados y jugados de terceros) e historial de partidas a partir de exportaciones CSV de BoardGameGeek (BGG).
- **Despliegue:** GitHub Pages (100% client-side, Zero-Build, Vanilla JS con ES Modules y WebComponents nativos).
- **Persistencia (Local-First + Cloud Sync):** 
  - Caché local instantáneo en `localStorage` bajo la clave `miludoteca_state_v1`.
  - Sincronización bajo demanda contra un GitHub Gist privado (`miludoteca-db.json`) usando GitHub REST API v3.
- **Seguridad:** El Personal Access Token (PAT) y el `gistId` nunca se incluyen en el código fuente. Se configuran en la interfaz y se guardan localmente en `localStorage` (`miludoteca_auth`).

## 2. Contrato de Datos (Schema JSON en Gist y LocalStorage)
```json
{
  "version": 1,
  "lastSync": "2026-11-13T17:30:00.000Z",
  "games": [
    {
      "bggId": "13",
      "title": "Catan",
      "ownership": "owned",
      "ownerNote": "Mío",
      "bggBaselinePlays": 4,
      "minPlayers": 3,
      "maxPlayers": 4,
      "playingTime": 90
    }
  ],
  "plays": [
    {
      "id": "1731529800000-abc12",
      "bggId": "13",
      "date": "2026-11-13",
      "players": 4,
      "notes": "Partida con expansión Navegantes"
    }
  ]
}
```

## 3. Checklist de Implementación

### Servicios
- [x] `js/services/gistSync.js`: `getAuthConfig()`, `saveAuthConfig(token, gistId)`, `loadLocalState()`, `saveLocalState(state)`, `pullFromGist()` y `pushToGist(state)`. Usa las claves `miludoteca_auth` y `miludoteca_state_v1`, el archivo `miludoteca-db.json` y la API REST v3; soporta respuestas truncadas vía `raw_url` y no envía el token fuera de dominios de GitHub.
- [x] `js/services/csvParser.js`: `mergeBggCsv(file, currentState)` parsea el CSV con PapaParse (`globalThis.Papa`), hace upsert por `bggId` sin perder `ownerNote`, `ownership` manual, campos extra ni `plays`, no muta el estado recibido y no persiste. Resuelve `{ state, stats: { added, updated, skipped } }`.

### Aplicación
- [x] `index.html`: estructura semántica, carga de ES Modules y de PapaParse por CDN, diálogos nativos (`<dialog>`) de alta, partida y configuración, toasts y contenedores de la UI.
- [x] `css/styles.css`: tema claro/oscuro automático, layout mobile-first, header sticky, grilla responsive, diálogos, toasts y soporte de `prefers-reduced-motion`.
- [x] `js/components/gameCard.js`: WebComponent `<game-card>` con Shadow DOM, badge de propiedad, jugadores/duración, partidas totales y evento `add-play` (bubbles + composed).
- [x] `js/app.js`: orquestación del estado, filtros por propiedad (Todos/Propios/Prestados/Jugados) y cantidad de jugadores, alta manual de prestados, `+1 Partida` con modal de notas, importación CSV, configuración token/gistId y estados de sincronización con el Gist.

### Despliegue
- [x] `.github/workflows/pages.yml`: validación de sintaxis y publicación del sitio estático en GitHub Pages.
- [x] `README.md`, `.gitignore` y `favicon.svg`; PapaParse 5.4.1 vendorizado en `js/vendor/`.
- [ ] Publicar el repo en GitHub, habilitar Pages y registrar la URL live en el README.
