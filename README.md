# MiLudoteca

Control personal de juegos de mesa: colección propia, juegos prestados, juegos
jugados en casa de otros e historial de partidas. Funciona 100% en el navegador y
sincroniza bajo demanda contra un GitHub Gist privado.

- **Demo:** <https://carlosguariglia.github.io/mi-ludoteca/>.
- **Stack:** Vanilla JS, ES Modules y WebComponents nativos. Sin build, sin framework y
  sin backend.
- **Persistencia:** `localStorage` (local-first) + GitHub Gist privado (backup y sync
  entre dispositivos).

## Funcionalidades

- Importación del CSV de la colección de BoardGameGeek (BGG) con upsert sin pérdida de
  datos.
- Filtros por propiedad (Todos, Propios, Prestados, Jugados) y por cantidad de
  jugadores.
- Alta manual de juegos prestados.
- Botón rápido **+1 Partida** con fecha, cantidad de jugadores y notas.
- Sincronización manual con el Gist: bajar, subir y estado visible (sin configurar,
  configurado, sincronizando, sincronizado, error).
- Tema claro/oscuro automático y diseño responsive.

## Estructura

```
index.html                 Interfaz y diálogos
css/styles.css             Estilos (mobile-first, tema claro/oscuro)
js/app.js                  Controlador de la UI y del estado
js/components/gameCard.js  WebComponent <game-card>
js/services/gistSync.js    Auth local, load/save y pull/push al Gist
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

## Configurar la sincronización con GitHub Gist

1. Creá un **Gist privado** (secret) llamado, por ejemplo, `miludoteca-db.json` con este
   contenido inicial:

   ```json
   { "version": 1, "lastSync": null, "games": [], "plays": [] }
   ```

   El nombre del archivo dentro del Gist debe ser exactamente `miludoteca-db.json`.

2. Creá un **Personal Access Token**:
   - Token clásico con scope `gist`, o
   - Token fine-grained con permiso *Gists: read and write*.

3. Copiá el ID del Gist desde la URL (`https://gist.github.com/usuario/<gistId>`).

4. En la app, entrá a **Configurar Gist**, pegá el token y el `gistId`, y guardá.

5. Usá **Bajar** para traer el estado remoto o **Subir** para reemplazarlo con el local.
   Ambas acciones son destructivas y piden confirmación.

> El token y el `gistId` se guardan solo en el `localStorage` de este navegador
> (`miludoteca_auth`). Nunca se incluyen en el código ni en el repositorio.

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

- La app no tiene backend: los datos no salen del navegador salvo hacia tu Gist.
- El Gist es privado, pero cualquiera con el token y el `gistId` puede leerlo. No lo uses
  para información sensible.
- Guardá el token solo en dispositivos de confianza y revocalo desde GitHub si se
  filtra.
- El repositorio público contiene el código, las especificaciones y la hoja de ruta,
  pero ningún secreto.

## Limitaciones conocidas

- La sincronización es manual y *last-write-wins*: no hay merge por juego ni detección
  de conflictos entre dispositivos.
- No hay edición ni borrado de juegos/partidas desde la UI (se puede hacer el merge
  reimportando el CSV).
- El contador de partidas combina la base de BGG (`bggBaselinePlays`) con las partidas
  registradas localmente.

## Créditos

- [PapaParse](https://www.papaparse.com/) 5.4.1, MIT — ver
  `js/vendor/PAPAPARSE-LICENSE.txt`.
- Datos de juegos: [BoardGameGeek](https://boardgamegeek.com/).
