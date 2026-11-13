---
name: github-gist-db
description: Patrón de persistencia y sincronización de un archivo JSON en un GitHub Gist privado usando la REST API v3 (autenticación local, pull/push, manejo de truncado, errores y política de conflictos).
---

# Especificación Técnica: GitHub Gist como base de datos

## 1. Alcance

Patrón para aplicaciones 100% client-side (GitHub Pages, sin backend) que necesitan
persistencia remota simple: el estado vive en `localStorage` y se sincroniza **bajo
demanda** contra un GitHub Gist privado. No hay sincronización automática ni en tiempo
real.

## 2. Archivo remoto

- Nombre exacto y case-sensitive: `miludoteca-db.json`.
- Un único archivo JSON por Gist; no usar varios archivos como tablas.
- Codificación UTF-8. Serializar con `JSON.stringify(estado, null, 2)`.
- El Gist debe ser privado (secret). El contenido sigue siendo accesible para quien
  tenga el `gistId` y un token válido, así que no es un lugar para secretos.

## 3. Autenticación y configuración local

- Personal Access Token (PAT) con scope mínimo `gist` (token clásico) o permiso
  *Gists: read and write* (fine-grained).
- Se guarda en `localStorage` bajo `miludoteca_auth`:

  ```json
  { "token": "ghp_xxx", "gistId": "abc123" }
  ```

- Reglas:
  - Nunca hardcodear el token ni el `gistId` en el código fuente.
  - Nunca commitear el archivo de configuración real.
  - Nunca loguear el token; en la UI mostrarlo enmascarado.
  - Permitir revocarlo desde GitHub → Settings → Developer settings.
- Contratos:
  - `getAuthConfig()` → `{ token, gistId }`; valores ausentes, tipos incorrectos o
    JSON corrupto devuelven `''` sin lanzar.
  - `saveAuthConfig(token, gistId)` → valida strings no vacíos tras `trim()`,
    persiste y devuelve la configuración normalizada; lanza `Error` si falta alguno.
  - Si falta token o `gistId`, `pullFromGist()` y `pushToGist()` deben fallar con un
    mensaje claro antes de hacer cualquier request.

## 4. Endpoints y headers

- Base: `https://api.github.com/gists/${encodeURIComponent(gistId)}`.
- Operaciones:
  - `GET` → leer el Gist.
  - `PATCH` → actualizar el contenido del archivo existente.
  - `POST https://api.github.com/gists` → crear un Gist (opcional; ver §7).
- Headers requeridos en **todas** las peticiones:

  ```javascript
  {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  }
  ```

- Enviar `cache: 'no-store'` en `fetch` para evitar respuestas cacheadas.
- El nombre del archivo dentro de `files` debe coincidir exactamente con
  `miludoteca-db.json`.

## 5. Lectura (`pullFromGist`)

1. Verificar la autenticación local.
2. `GET` al endpoint base.
3. Si `!response.ok`, lanzar un `Error` con el status y el `message` de GitHub (§9).
4. Parsear el JSON de la respuesta. Forma relevante:

   ```json
   {
     "id": "abc123",
     "truncated": false,
     "files": {
       "miludoteca-db.json": {
         "filename": "miludoteca-db.json",
         "content": "{ ...estado serializado... }",
         "truncated": false,
         "raw_url": "https://gist.githubusercontent.com/..."
       }
     }
   }
   ```

5. Si el archivo no existe en `files`, error explícito.
6. **Truncado:** GitHub recorta el `content` de archivos grandes en la respuesta de la
   API. Si `gist.truncated === true` o `files[...].truncated === true`, descargar el
   contenido completo desde `files[...].raw_url` (segundo `fetch`, también con el
   header `Authorization`, porque el Gist es privado). Si falta `raw_url`, error.
   Por seguridad, validar que `raw_url` sea `https` y pertenezca a `github.com`,
   `api.github.com` o `*.githubusercontent.com` antes de enviarle el token.
7. Parsear `content` como JSON, validar que sea un objeto (no array), normalizar (§7),
   persistir en `localStorage` con `saveLocalState(state)` y devolver el estado.

`pullFromGist()` **reemplaza** el estado local completo; no fusiona (§8).

## 6. Escritura (`pushToGist`)

1. Verificar la autenticación local.
2. Normalizar el estado, forzar `version: 1` y `lastSync = new Date().toISOString()`.
3. `PATCH` al endpoint base con:

   ```json
   {
     "files": {
       "miludoteca-db.json": {
         "content": "{\n  \"version\": 1,\n  ...\n}"
       }
     }
   }
   ```

   `content` es un **string** con el JSON serializado, no un objeto anidado.
4. Solo si `response.ok`, persistir el estado enviado con `saveLocalState()` y
   devolverlo. Si la request falla, el estado local no debe quedar marcado como
   sincronizado.
5. La respuesta 200 del `PATCH` no necesita procesarse más allá de comprobar `ok`.

## 7. Creación del Gist

El flujo asumido es manual: el usuario crea un Gist privado con el archivo
`miludoteca-db.json` (contenido inicial `{}` o el estado por defecto) y pega el
`gistId` en la configuración de la app.

Alternativa programática (opcional, no implementada): `POST /gists` con
`{ "description": "MiLudoteca DB", "public": false, "files": { "miludoteca-db.json": { "content": "{}" } } }`
y guardar el `id` devuelto como `gistId`.

## 8. Contrato de datos

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

Reglas de normalización (aplicadas al leer de `localStorage` y del Gist):

- `version`: número finito; por defecto `1`.
- `lastSync`: string ISO 8601 o `null`.
- `games` y `plays`: siempre arrays; si el valor no es array, `[]`.
- Solo se conservan estas cuatro claves; cualquier campo extra del nivel superior se
  descarta al guardar o enviar.
- `ownership` ∈ `"owned" | "borrowed" | "played_elsewhere"`.
- `bggId` es string (aunque numérico en BGG); `bggBaselinePlays` y `playingTime` son
  enteros ≥ 0; `minPlayers`/`maxPlayers` enteros ≥ 1.

Claves de `localStorage`:

| Clave | Contenido |
|---|---|
| `miludoteca_state_v1` | Estado completo (schema anterior). |
| `miludoteca_auth` | `{ token, gistId }`. |

## 9. Política de sincronización y conflictos

Comportamiento actual:

- **Manual:** solo se sincroniza cuando el usuario lo pide (`pull`/`push`).
- **Pull:** reemplazo total del estado local por el remoto. Se conserva el `lastSync`
  que trae el Gist (no se reescribe con la hora del pull).
- **Push:** reemplazo total del archivo remoto por el estado local. El `lastSync` se
  actualiza en el momento del push exitoso.
- **Conflictos:** *last-write-wins* por `lastSync`. No hay merge por `bggId` ni
  detección de cambios concurrentes.

Consecuencias a documentar en la UI:

- Hacer `pull` descarta ediciones locales no enviadas.
- Hacer `push` descarta cambios remotos hechos desde otro dispositivo.
- Flujo recomendado: `pull` al abrir o antes de editar → editar → `push` al terminar.
- Si se detecta que el `lastSync` remoto es más nuevo que el local, advertir antes de
  un `push` (mejora pendiente; hoy no está implementada).
- Si `loadLocalState()` encuentra JSON corrupto, cae al estado por defecto y avisa por
  consola: no sobrescribir el Gist automáticamente en ese caso.

## 10. Manejo de errores

| Situación | Causa típica | Acción |
|---|---|---|
| `401` | Token inválido, vencido o revocado. | Mensaje accionable; pedir token nuevo. |
| `403` | Falta scope `gist` o rate limit. | Revisar `X-RateLimit-Remaining` / `Retry-After`; reintentar más tarde. |
| `404` | `gistId` inexistente o sin acceso. | Verificar el ID y que el Gist sea del usuario del token. |
| `422` | Payload inválido (nombre de archivo o body incorrecto). | Revisar la forma del body de §6. |
| `5xx` | Fallo de GitHub. | Reintentar con espera; no marcar como sincronizado. |
| Error de red / CORS | Sin conexión o bloqueo. | Envolver con `{ cause }` y mensaje claro. |
| JSON inválido en el Gist | Edición manual rota. | No pisar el remoto; informar y ofrecer corregir. |
| Archivo ausente | Gist sin `miludoteca-db.json`. | Error explícito, no crear silenciosamente. |

Extraer el detalle del body de error (`{ "message": "..." }`) cuando exista. Nunca
incluir el token en el mensaje.

## 11. Implementación de referencia

`js/services/gistSync.js` (ES Module, sin dependencias):

| Función | Efecto |
|---|---|
| `getAuthConfig()` | Lee `miludoteca_auth`; tolerante a corrupción. |
| `saveAuthConfig(token, gistId)` | Valida, normaliza y persiste la auth. |
| `loadLocalState()` | Lee y normaliza `miludoteca_state_v1`; default si falta o está corrupto. |
| `saveLocalState(state)` | Normaliza, persiste y devuelve; no toca `lastSync`. |
| `pullFromGist()` | GET, soporta `raw_url`, persiste y devuelve el estado remoto. |
| `pushToGist(state)` | PATCH, actualiza `lastSync`, persiste solo si la respuesta es OK. |

## 12. Checklist de aceptación

- [ ] `getAuthConfig()` devuelve `''` con storage vacío, JSON corrupto o tipos inválidos.
- [ ] `saveAuthConfig()` recorta espacios y rechaza valores vacíos.
- [ ] `loadLocalState()` devuelve el estado por defecto si no hay datos o están corruptos.
- [ ] `saveLocalState()` respeta `lastSync` y descarta claves desconocidas.
- [ ] `pullFromGist()` persiste el estado remoto y respeta su `lastSync`.
- [ ] `pullFromGist()` funciona con `truncated: true` usando `raw_url`.
- [ ] `pullFromGist()` rechaza un `raw_url` que no sea de GitHub.
- [ ] `pushToGist()` usa `PATCH`, el header `Authorization` y el body con `content` string.
- [ ] `pushToGist()` actualiza `lastSync` y solo persiste ante respuesta OK.
- [ ] Un `401` produce un error con status y mensaje de GitHub.
- [ ] Sin auth, `pull`/`push` fallan antes de llamar a `fetch`.
