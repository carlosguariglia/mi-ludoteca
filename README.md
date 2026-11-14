# MiLudoteca

Control personal de juegos de mesa: colección propia, juegos prestados, juegos
jugados en casa de otros e historial de partidas. Funciona 100% en el navegador,
sin cuentas ni backend, y mueve tus datos entre dispositivos con copias de
seguridad JSON que podés enviar por WhatsApp, email o Drive.

- **Demo:** <https://carlosguariglia.github.io/mi-ludoteca/>.
- **Stack:** Vanilla JS, ES Modules y WebComponents nativos. Sin build, sin framework y
  sin backend.
- **Persistencia:** `localStorage` (local-first) + copias de seguridad JSON manuales.

## Funcionalidades

- Importación del CSV de la colección de BoardGameGeek (BGG) con upsert sin pérdida de
  datos.
- Filtros por propiedad (Todos, Propios, Prestados, Jugados) y por cantidad de
  jugadores.
- Alta manual de juegos prestados.
- Botón rápido **+1 Partida** con fecha, cantidad de jugadores y notas.
- **Guardar copia:** descarga un JSON con toda la colección y las partidas, o lo
  comparte con el menú del sistema (WhatsApp, email, Drive…).
- **Cargar copia:** valida el archivo, muestra un resumen y reemplaza la colección
  local tras confirmar.
- Estado visible de la copia en el header (sin datos, cambios sin guardar, copia
  guardada).
- Tema claro/oscuro automático y diseño responsive.

## Estructura

```
index.html                 Interfaz y diálogos
css/styles.css             Estilos (mobile-first, tema claro/oscuro)
js/app.js                  Controlador de la UI y del estado
js/components/gameCard.js  WebComponent <game-card>
js/services/localStore.js  Persistencia local y metadatos de respaldo
js/services/backup.js      Formato, validación y serialización del JSON
js/services/csvParser.js   Parseo del CSV de BGG y upsert
js/vendor/                 PapaParse 5.4.1 (MIT)
.github/workflows/         Deploy a GitHub Pages
.opencode/skills/          Especificaciones técnicas (docs internas)
MEMORY.md                  Decisiones y hoja de ruta (docs internas)
```

## Uso local

Los ES Modules no funcionan abriendo `index.html` con `file://`, hace falta un servidor
estático:

```bash
python3 -m http.server 8000
# Abrí http://localhost:8000
```

No hay instalación ni build.

## Copias de seguridad

Los datos viven en el `localStorage` del navegador. Para moverlos a otro dispositivo o
tener un respaldo:

1. En el dispositivo A: **Guardar copia**.
2. Elegí **Descargar** o **Compartir** (si el navegador lo permite). El archivo se llama
   `miludoteca-AAAA-MM-DD.json`.
3. Enviá el archivo por WhatsApp, email o subilo a Drive.
4. En el dispositivo B: abrí la app → **Cargar copia** → elegí el archivo.
5. Revisá el resumen y confirmá con **Reemplazar colección**.

### Formato del archivo

```json
{
  "app": "miludoteca",
  "schemaVersion": 1,
  "exportedAt": "2026-11-13T18:00:00.000Z",
  "state": {
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
}
```

La importación también acepta un estado crudo con las listas `games` y `plays`. El
archivo se valida antes de tocar el estado local: si el JSON es inválido, falta un
campo obligatorio o la versión de schema es más nueva, la app muestra el error y no
reemplaza nada.

> **Importante:** cargar una copia **reemplaza** toda la colección y el historial del
> dispositivo. No fusiona datos. Si editás en dos dispositivos, exportá antes de
> importar en el otro.

## Importar la colección de BGG

1. En BGG: **Collection → Export → CSV**.
2. En la app: **Importar CSV** y elegí el archivo.
3. La app informa cuántos juegos se agregaron, actualizaron u omitieron.

La importación nunca borra juegos ausentes del CSV, conserva `ownerNote` y el
`ownership` marcado a mano, y no toca el historial de partidas.

## Deploy en GitHub Pages

El repositorio incluye `.github/workflows/pages.yml`, que valida la sintaxis de los
módulos y publica únicamente el sitio estático (`index.html`, `favicon.svg`, `css/` y
`js/`).

1. Creá un repositorio vacío `mi-ludoteca` en GitHub.
2. Agregá el remoto y subí `main`:

   ```bash
   git remote add origin https://github.com/TU-USUARIO/mi-ludoteca.git
   git push -u origin main
   ```

3. En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Si el workflow ya corrió antes de habilitar Pages, re-ejecutalo desde **Actions →
   Deploy MiLudoteca to GitHub Pages → Run workflow**.
5. La URL queda en `https://carlosguariglia.github.io/mi-ludoteca/`.

## Privacidad y seguridad

- La app no tiene backend ni cuentas: los datos no salen del navegador, salvo cuando
  vos compartís o descargás una copia.
- El archivo JSON contiene tu colección y tus partidas sin cifrar. Tratalo como
  información personal y guardalo en un lugar de confianza.
- El repositorio público contiene el código, las especificaciones y la hoja de ruta,
  pero ningún dato de usuario.

## Limitaciones conocidas

- La transferencia es manual: no hay sincronización automática en tiempo real ni
  detección de conflictos.
- Cargar una copia reemplaza el estado completo; no hay fusión por juego ni por partida.
- No hay edición ni borrado de juegos/partidas desde la UI (se puede hacer el merge
  reimportando el CSV).
- El contador de partidas combina la base de BGG (`bggBaselinePlays`) con las partidas
  registradas localmente.

## Créditos

- [PapaParse](https://www.papaparse.com/) 5.4.1, MIT — ver
  `js/vendor/PAPAPARSE-LICENSE.txt`.
- Datos de juegos: [BoardGameGeek](https://boardgamegeek.com/).
