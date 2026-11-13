---
name: bgg-csv-schema
description: Reglas de parseo de exportaciones CSV de BoardGameGeek y actualización incremental (upsert) sin pérdida de datos sobre el estado de MiLudoteca.
---

# Especificación Técnica: Importación CSV de BoardGameGeek

## 1. Alcance

Importar el CSV de la colección de BGG (`collectionexport.csv`) para poblar y
actualizar `games` en el estado local, sin pisar datos propios del usuario ni tocar el
historial de partidas.

## 2. Entrada

- Archivo CSV exportado desde BGG, codificación UTF-8, con fila de encabezados.
- Librería: asumir `window.Papa` disponible globalmente vía CDN de PapaParse.
- Parseo:

  ```javascript
  Papa.parse(file, { header: true, skipEmptyLines: true, complete: ... })
  ```

- Ignorar filas sin `objectid` (pueden ser líneas vacías o basura al final).
- Aplicar `trim()` a los valores de texto antes de mapearlos.

## 3. Mapeo de columnas BGG → Modelo MiLudoteca

| Columna CSV | Campo destino | Regla |
|---|---|---|
| `row.objectid` | `bggId` | String, `trim`. Ignorar filas sin `objectid`. |
| `row.objectname` | `title` | String, `trim`. |
| `row.own` | `ownership` | `"1"` → `"owned"`; distinto de `"1"` → `"played_elsewhere"` (solo al insertar). |
| `row.numplays` | `bggBaselinePlays` | `parseInt(row.numplays, 10) || 0`. |
| `row.minplayers` | `minPlayers` | `parseInt(row.minplayers, 10) || 1`. |
| `row.maxplayers` | `maxPlayers` | `parseInt(row.maxplayers, 10) || 1`. |
| `row.playingtime` | `playingTime` | `parseInt(row.playingtime, 10) || 0`. |

Al insertar un juego nuevo, `ownerNote` se inicializa en `row.own === "1" ? "Mío" : ""`.

## 4. Lógica de upsert (fusión sin pérdida de datos)

- Indexar `currentState.games` en un `Map` por `bggId`.
- Si el `bggId` **no existe**: insertar el nuevo objeto juego con
  `ownerNote: row.own === "1" ? "Mío" : ""`.
- Si el `bggId` **ya existe**:
  - Actualizar `title`, `minPlayers`, `maxPlayers`, `playingTime` y
    `bggBaselinePlays`.
  - Si en el CSV `row.own === "1"`, actualizar `ownership` a `"owned"`. Si
    `row.own === "0"`, **conservar** el `ownership` actual del usuario (porque puede
    haberlo marcado manualmente como `"borrowed"`).
  - **Nunca** sobrescribir `ownerNote` ni modificar el array global
    `currentState.plays`.

La operación debe ser idempotente: reimportar el mismo CSV no duplica juegos ni
degrada campos editados a mano.

## 5. Reglas adicionales

- `ownership` solo admite `"owned"`, `"borrowed"` o `"played_elsewhere"`.
- Nunca eliminar juegos ausentes del CSV: la colección de BGG puede estar filtrada o
  incompleta. Si se quiere borrar un juego, debe ser una acción manual del usuario.
- No crear ni modificar `plays` durante la importación.
- El resultado se persiste con `saveLocalState(estadoActualizado)` y no se envía
  automáticamente al Gist: el usuario decide cuándo hacer `pushToGist()`.
- Ante un CSV sin columnas esperadas o sin filas válidas, informar un error claro y no
  alterar el estado actual.

## 6. Contrato de `mergeBggCsv(file, currentState)`

Devuelve una `Promise` con el estado fusionado y las estadísticas de la importación:

```js
{
  state: { version, lastSync, games, plays },
  stats: { added, updated, skipped }
}
```

- `added`: juegos nuevos insertados.
- `updated`: juegos existentes alcanzados por el CSV (aunque sus valores no cambien).
- `skipped`: filas descartadas por no tener `objectid`.
- `version` y `lastSync` se conservan del estado recibido (defaults `1` y `null`).
- `plays` se devuelve intacto, en un array nuevo.
- No muta `currentState` ni sus objetos, y no persiste: el llamador usa
  `saveLocalState(state)` y decide si hace `pushToGist()`.

## 7. Checklist de aceptación

- [ ] Se ignoran filas sin `objectid` y se aplica `trim` a los textos.
- [ ] Los valores numéricos usan `parseInt(..., 10)` con los defaults indicados.
- [ ] Un juego nuevo recibe `ownerNote: "Mío"` si `own === "1"`, o `""` si no.
- [ ] Un juego existente actualiza sus campos BGG sin perder `ownerNote`.
- [ ] `own === "0"` no degrada un `ownership` marcado como `"borrowed"`.
- [ ] `plays` queda intacto tras la importación.
- [ ] Reimportar el mismo CSV no duplica juegos.
- [ ] Un CSV inválido no modifica el estado y produce un error legible.
