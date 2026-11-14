# Project Memory: MiLudoteca

## 1. Visión y Arquitectura
- **Nombre de la App:** MiLudoteca
- **Propósito:** Control personal de juegos de mesa (propios, prestados y jugados de terceros) e historial de partidas a partir de exportaciones CSV de BoardGameGeek (BGG).
- **Despliegue:** GitHub Pages (100% client-side, Zero-Build, Vanilla JS con ES Modules y WebComponents nativos).
- **URL live:** https://carlosguariglia.github.io/mi-ludoteca/ (deploy automático con GitHub Actions desde `main`).
- **Persistencia (Local-First + Backup Manual):**
  - Estado local en `localStorage` bajo la clave `miludoteca_state_v1`.
  - Copias de seguridad en archivo JSON (`miludoteca-AAAA-MM-DD.json`) que el usuario descarga o comparte por WhatsApp/email/Drive y luego carga en otro dispositivo.
  - Metadatos de respaldo en `miludoteca_backup_meta_v1` con `{ lastBackupAt, dirty }`.
- **Sin cuentas ni backend:** no hay autenticación, tokens ni servicios externos. La app funciona con cualquier navegador.

## 2. Contrato de Datos

### Estado local (`miludoteca_state_v1`)
```json
{
  "version": 1,
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

### Archivo de copia de seguridad
```json
{
  "app": "miludoteca",
  "schemaVersion": 1,
  "exportedAt": "2026-11-13T18:00:00.000Z",
  "state": { "version": 1, "games": [], "plays": [] }
}
```
La importación acepta también el estado crudo (`{ version, games, plays }`). Los archivos de más de 10 MB, con JSON inválido, sin `games`/`plays`, con un `schemaVersion` más nuevo o con juegos/partidas mal formados se rechazan sin modificar el estado.

## 3. Checklist de Implementación

### Servicios
- [x] `js/services/localStore.js`: `loadLocalState()`, `saveLocalState(state)`, `getBackupMeta()`, `markBackupSaved(date)`, `removeLegacyAuth()` y `normalizeState()`. Usa `miludoteca_state_v1`, `miludoteca_backup_meta_v1` y borra la clave legada `miludoteca_auth`.
- [x] `js/services/backup.js`: `buildBackupFilename()`, `createBackup()`, `serializeBackup()`, `parseBackupPayload()` y `parseBackupFile()`. Valida formato, schema, juegos y partidas antes de importar.
- [x] `js/services/csvParser.js`: `mergeBggCsv(file, currentState)` parsea el CSV con PapaParse (`globalThis.Papa`), hace upsert por `bggId` sin perder `ownerNote`, `ownership` manual, campos extra ni `plays`, no muta el estado recibido y no persiste. Resuelve `{ state, stats: { added, updated, skipped } }`.

### Aplicación
- [x] `index.html`: estructura semántica, carga de ES Modules y de PapaParse local, diálogos nativos (`<dialog>`) de alta, partida, exportación e importación, toasts y contenedores de la UI.
- [x] `css/styles.css`: tema claro/oscuro automático, layout mobile-first, header sticky con estado de copia, grilla responsive, diálogos, toasts y soporte de `prefers-reduced-motion`.
- [x] `js/components/gameCard.js`: WebComponent `<game-card>` con Shadow DOM, badge de propiedad, jugadores/duración, partidas totales y evento `add-play` (bubbles + composed).
- [x] `js/app.js`: orquestación del estado, filtros por propiedad y cantidad de jugadores, alta manual de prestados, `+1 Partida`, importación CSV, exportación por descarga o Web Share API, importación con preview/confirmación y estado de respaldo en el header.

### Despliegue
- [x] `.github/workflows/pages.yml`: validación de sintaxis y publicación del sitio estático en GitHub Pages.
- [x] `README.md`, `.gitignore` y `favicon.svg`; PapaParse 5.4.1 vendorizado en `js/vendor/`.
- [x] Publicado en GitHub Pages: https://carlosguariglia.github.io/mi-ludoteca/ (workflow con `enablement: true`, sitio verificado en vivo).

## 4. Flujo de Copias
1. **Guardar copia** genera `miludoteca-AAAA-MM-DD.json` con `app`, `schemaVersion`, `exportedAt` y `state`.
2. En móvil, si `navigator.canShare({ files })` está disponible, se ofrece **Compartir** (WhatsApp, email, Drive…). Si falla o no está, se descarga el archivo.
3. **Cargar copia** lee y valida el archivo, muestra juegos/partidas y la fecha de exportación, y pide confirmación.
4. Confirmar reemplaza el estado completo y marca la copia como respaldada (`lastBackupAt` = `exportedAt` o el momento actual).

## 5. Decisiones Técnicas
- Sin integraciones de nube ni autenticación: los datos solo salen del navegador cuando el usuario exporta o comparte una copia.
- El control de respaldos vive en `miludoteca_backup_meta_v1`; el estado no guarda metadatos de sincronización.
- Importación destructiva (reemplazo total) con preview; no hay merge para mantener el flujo simple.
- Web Share API solo se muestra si el navegador puede compartir archivos; siempre queda la descarga como fallback.

## 6. Estado de la Sesión (2026-11-13)
- [x] Refactor completo: se eliminó la sync con Gist, el token, el `gistId` y el diálogo de configuración.
- [x] Servicios nuevos `localStore.js` y `backup.js`; `csvParser.js` ya no maneja `lastSync`.
- [x] Migración silenciosa: al cargar un estado viejo se elimina `lastSync` del `localStorage` y se borra `miludoteca_auth`.
- [x] Commit `40b30f2` (`refactor: reemplazar sync con Gist por copias JSON locales`) pusheado a `main`.
- [x] Workflow de GitHub Pages run 4 en **success**; sitio live actualizado.
- [x] Verificado en vivo con Chromium: exportar/descargar, estado “Copia guardada”, cambios sin guardar, importar con preview, reemplazo completo, archivo inválido sin tocar datos, sin requests a GitHub, sin errores de consola y sin overflow a 390 px.
- [x] `https://carlosguariglia.github.io/mi-ludoteca/js/services/gistSync.js` devuelve **404**.
- **Pendiente de prueba real:** Web Share con archivos (`navigator.share`) no se puede validar en Chromium headless; falta probarlo en Android/iOS.

## 7. Próximos Pasos (retomar mañana)
1. Probar el circuito completo en dos celulares reales: **Guardar copia → Compartir por WhatsApp/email → Cargar copia** en el otro dispositivo.
2. Verificar en iOS Safari el menú de compartir archivos y el fallback de descarga.
3. Decidir si se agrega edición y borrado de juegos/partidas desde la UI.
4. Evaluar un modo **fusionar** en la importación (hoy solo reemplaza todo).
5. Evaluar cifrado opcional del JSON con WebCrypto para compartir datos sensibles.
6. Evaluar un recordatorio de respaldo más visible si pasan muchos días sin guardar copia.
