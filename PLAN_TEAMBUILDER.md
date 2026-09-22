# Teambuilder BATS + equipos regulados — Plan de implementación

> **Para quien ejecute esto:** las tareas van en orden; cada una termina con test verde y commit.
> Todo el código, los comentarios y los textos de UI van **en español**.

**Goal:** que los equipos de la liga se construyan y registren en BATS (sets completos, con sprites,
autocompletado legal y reglas de temporada en vivo), y que Showdown solo deje batallar con el equipo
registrado.

**Arquitectura:** el fork de Pokémon Showdown deja de ser solo el sitio donde se juega y pasa a ser
la **fuente de verdad del dex**: un exportador offline vuelca especies, movimientos, objetos,
habilidades y learnsets a JSON. Ese snapshot alimenta dos consumidores: el frontend (validación
real-time en el navegador, sin PokéAPI) y una tabla espejo en Postgres (`tournament.dex_species`) que
permite a la API validar en el servidor sin confiar en el body del cliente. El registro guarda el set
completo; un archivo `active_rosters.json` —sincronizado igual que `active_bans.json`— deja que
`config/formats.ts` rechace en batalla cualquier set que no esté registrado, y el plugin devuelve a
BATS el veredicto del `TeamValidator` real como doble comprobación asíncrona.

**Tech stack:** Node (exportador y formatos de PS), Python 3 / FastAPI / psycopg2, PostgreSQL,
React 19 + Vite + TanStack Query + Tailwind v4 (`bats/web`), pytest, vitest, mocha (PS).

**Spec:** este documento (surge de la sesión de brainstorming del 2026-09-21). Decisiones tomadas:
dex de Showdown (no PokéAPI) · PS bloquea + BATS audita · se congelan **sets completos** · editar un
set ya registrado es libre, cambiar de especie cuenta · learnsets por trozos · doble validación
asíncrona con el validador real.

---

## Context

Hoy el registro de equipos es un `PasteBuilder` que resuelve cada especie contra **PokéAPI**
(`web/src/lib/pokeapi.ts`, `web/src/lib/team-resolve.ts`): lento, externo, con nombres que no
coinciden con los de Showdown y sin learnsets, tags ni BST. Por eso:

1. Las reglas de Paradox y pseudo-legendarios **solo** las puede aplicar `config/formats.ts`; la API
   ni las ve (`rules.py` lo dice explícitamente).
2. La API **confía en el cliente**: `color`, `generation` y `egg_groups` viajan en el body de
   `POST /api/teams/me`, así que un jugador puede declarar lo que quiera y pasar las restricciones
   de la temporada.
3. Se guardan sets completos (`roster_pokemon` tiene item/ability/nature/tera/moves/evs/ivs desde
   `v4.sql`) pero **nadie los hace cumplir**: en batalla se puede llevar cualquier cosa y el ETL solo
   deja un registro en `tournament.team_violations` *después*.
4. Construir el equipo es "pega el paste y reza": sin buscador, sin sprites al elegir, sin saber qué
   movimientos son legales, sin ver qué regla te falta hasta que envías.

El objetivo es que crear el equipo en BATS sea mejor que hacerlo en el teambuilder de Showdown para
esta liga —porque conoce las reglas del mes— y que lo registrado sea lo que de verdad se juega.

---

## Global Constraints

- **Español** en código, comentarios, docs y mensajes de UI.
- `pandas` **no** puede entrar al árbol de imports de la API (hay un test que lo verifica). El
  exportador y el importador del dex viven fuera de ese árbol.
- El snapshot del dex se sirve **estático** desde `bats/web/public/dex/`; la función Python de Vercel
  no lo incluye (lee `tournament.dex_species`).
- Frontera de esquemas: lo nuevo va en `tournament.*`. Nada en `tournament` referencia a `battle`.
- Una sola fórmula / una sola definición de regla: `bats_core/rules.py` sigue siendo la fuente; lo
  que se duplica en TypeScript va acompañado de un test de paridad.
- Transacciones: un bloque `with get_db()` es una transacción; `db.execute()` no hace commit.
- TypeScript de PS: tabs y `eslint-ps-standard`. `bats/web`: 2 espacios.
- **Al probar nunca uses la base real ni escribas archivos reales de PS**: `createdb`/`dropdb` para
  las pruebas y `BATS_PS_DIR` apuntando a un sandbox.
- Los votos de ban siguen siendo anónimos: nada de esto toca `ban_votes`.
- Commits: mensaje en español, terminando con
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Estructura de archivos

**Nuevos — BATS backend**
| Archivo | Responsabilidad |
|---|---|
| `bats/tools/export_dex.js` | Exportador offline: `dist/sim` de PS → JSON del dex. Node puro, no se despliega. |
| `bats/tools/check_dex_export.js` | Aserciones sobre el snapshot generado (hace de test del exportador). |
| `bats/tools/roster_parity.js` | Comprueba que `canonical_set` (Python) y `canonicalSet` (formats.ts) coinciden. |
| `bats/bats_core/db/migrations/v11.sql` | `tournament.dex_species`, `tournament.dex_meta`, columnas de validación en `roster`. |
| `bats/bats_core/dex.py` | Importa el snapshot a `dex_species`/`dex_meta` y lee metadatos de especies. |
| `bats/bats_core/teamset.py` | Forma canónica de un set (la que compara Showdown). |
| `bats/bats_core/api/routes/dex.py` | `GET /api/dex/meta`, `GET /api/teams/rosters` vive en teams.py. |

**Modificados — BATS backend**
`bats_core/rules.py` (reglas nuevas + metadatos del servidor) · `bats_core/api/routes/teams.py`
(PATCH de set, rosters, validación resuelta en servidor) · `bats_core/api/routes/ingest.py`
(veredicto del validador) · `bats_core/api/schemas.py` · `bats_core/api/common.py` · `bats_core/cli.py`
(subcomando `dex`) · `bats_core/api/main.py` (router nuevo).

**Nuevos — frontend** (`bats/web/src/`)
`lib/dex/snapshot.ts` (carga y cachea el snapshot) · `lib/dex/learnsets.ts` (carga perezosa por
bucket) · `lib/dex/validate.ts` (motor de reglas en el cliente) · `lib/dex/sets.ts` (normalización y
canonical) · `components/ui/combobox.tsx` · `components/builder/TeamBuilder.tsx` ·
`components/builder/SpeciesPicker.tsx` · `components/builder/SetEditor.tsx` ·
`components/builder/EVEditor.tsx` · `components/builder/PasteIO.tsx` ·
`public/dex/*.json` (snapshot commiteado).

**Borrados — frontend**: `lib/pokeapi.ts`, `lib/team-resolve.ts` (los reemplaza el snapshot).

**Modificados — Showdown**
`sim/team-validator.ts` (expone el usuario que valida) · `config/formats.ts` (enforcement del roster)
· `server/chat-plugins/bats-ingest.ts` (`syncRosters` + doble check) · `test/server/chat-plugins/`
(test del patch).

---

# Fase 1 — El dex de Showdown como fuente de verdad

### Task 1: Exportador del dex

**Files:**
- Create: `bats/tools/export_dex.js`, `bats/tools/check_dex_export.js`
- Genera: `bats/web/public/dex/{meta,species,moves,items,abilities,natures}.json` y
  `bats/web/public/dex/learnsets/<letra>.json`

**Interfaces:**
- Produce: `meta.json = { generated_at, ps_commit, counts, formats: { league, sparring } }`
- Produce: `species.json = { [id]: { id, name, num, types, bst, baseStats, color, eggGroups, gen,
  tags, abilities, spriteid, baseSpecies, forme, prevo, isNonstandard, restricted, paradox, pseudo,
  ultraBeast, leagueLegal } }`
- Produce: `moves.json = { [id]: { id, name, type, category, basePower, accuracy, pp, priority,
  shortDesc } }`, `items.json`/`abilities.json` = `{ [id]: { id, name, desc } }`,
  `natures.json = { [id]: { name, plus, minus } }`
- Produce: `learnsets/<c>.json = { [speciesId]: string[] }` — ids de movimiento legales en NatDex.

- [x] **Paso 1: escribir el verificador (el "test" del exportador)**

`bats/tools/check_dex_export.js` — Node puro, sin dependencias. Lee `web/public/dex/` y lanza si algo
no cuadra:

```js
'use strict';
const fs = require('fs');
const path = require('path');

const DEX = path.resolve(__dirname, '..', 'web', 'public', 'dex');
const read = f => JSON.parse(fs.readFileSync(path.join(DEX, f), 'utf8'));
let fails = 0;
const check = (ok, msg) => { if (!ok) { console.error(`✗ ${msg}`); fails++; } else console.log(`✓ ${msg}`); };

const species = read('species.json');
const moves = read('moves.json');
const meta = read('meta.json');

check(Object.keys(species).length > 1000, 'más de 1000 especies exportadas');
check(species.garchomp.bst === 600 && species.garchomp.pseudo === true, 'Garchomp es pseudo-legendario');
check(species.garchomp.leagueLegal === true, 'Garchomp es legal en la liga');
check(species.koraidon.paradox === true, 'Koraidon es Paradox');
check(species.koraidon.restricted === true, 'Koraidon es restricted legendary');
check(species.buzzwole.ultraBeast === true, 'Buzzwole es Ultra Beast');
check(species.zaciancrowned.leagueLegal === false, 'Zacian-Crowned está prohibido');
check(species.pikachu.color === 'Yellow' && species.pikachu.gen === 1, 'Pikachu: color y generación');
check(species.dragonite.eggGroups.includes('Water 1'), 'Dragonite conserva sus egg groups');
check(moves.earthquake.basePower === 100, 'Earthquake tiene 100 de poder');

const bucket = read(path.join('learnsets', 'g.json'));
check(bucket.garchomp.includes('earthquake'), 'Garchomp aprende Earthquake');
check(!bucket.garchomp.includes('psychic'), 'Garchomp NO aprende Psychic');
check(!!meta.generated_at && !!meta.ps_commit, 'meta tiene fecha y commit de PS');

process.exit(fails ? 1 : 0);
```

- [x] **Paso 2: ejecutarlo para verlo fallar**

Run: `cd /Users/jazar/Documents/GitHub/bats && node tools/check_dex_export.js`
Expected: FAIL — `ENOENT ... web/public/dex/species.json`.

- [x] **Paso 3: escribir el exportador**

`bats/tools/export_dex.js`. Requiere `dist/` de PS compilado (`cd ../pokemon-showdown && node build`).
Núcleo:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PS_DIR = process.env.BATS_PS_DIR || path.resolve(__dirname, '..', '..', 'pokemon-showdown');
const OUT = path.resolve(__dirname, '..', 'web', 'public', 'dex');
const LEAGUE = 'gen9pinchesgueysleague';
const LEGENDARY_TAGS = new Set(['Sub-Legendary', 'Restricted Legendary', 'Mythical', 'Ultra Beast', 'Paradox']);

const { Dex } = require(path.join(PS_DIR, 'dist/sim/dex'));
Dex.formats.load();

const dex = Dex.forFormat(LEAGUE);
const ruleTable = Dex.formats.get(LEAGUE).ruleTable || dex.formats.get(LEAGUE).ruleTable;

const write = (file, data) => {
	fs.mkdirSync(path.dirname(path.join(OUT, file)), { recursive: true });
	fs.writeFileSync(path.join(OUT, file), JSON.stringify(data));
};

const species = {};
const learnsets = {};      // bucket -> { speciesId: [moveId] }
for (const sp of dex.species.all()) {
	if (sp.isNonstandard && sp.isNonstandard !== 'Past' && sp.isNonstandard !== 'Unobtainable') continue;
	const tags = sp.tags || [];
	const bst = Object.values(sp.baseStats).reduce((a, b) => a + b, 0);
	species[sp.id] = {
		id: sp.id, name: sp.name, num: sp.num, types: sp.types, bst, baseStats: sp.baseStats,
		color: sp.color, eggGroups: sp.eggGroups, gen: dex.species.get(sp.baseSpecies || sp.name).gen,
		tags, abilities: Object.values(sp.abilities), spriteid: sp.spriteid,
		baseSpecies: sp.baseSpecies, forme: sp.forme || null, prevo: sp.prevo || null,
		isNonstandard: sp.isNonstandard || null,
		restricted: tags.some(t => ['Sub-Legendary', 'Restricted Legendary', 'Mythical'].includes(t)),
		paradox: tags.includes('Paradox'),
		ultraBeast: tags.includes('Ultra Beast'),
		pseudo: bst === 600 && !tags.some(t => LEGENDARY_TAGS.has(t)),
		leagueLegal: !ruleTable.isBannedSpecies(sp) && !tags.includes('Ultra Beast'),
	};
	const bucket = /^[a-z]/.test(sp.id) ? sp.id[0] : '0';
	(learnsets[bucket] ||= {})[sp.id] = [...dex.species.getMovePool(sp.id, true)];
}

const moves = {};
for (const mv of dex.moves.all()) {
	if (mv.isNonstandard && mv.isNonstandard !== 'Past') continue;
	moves[mv.id] = {
		id: mv.id, name: mv.name, type: mv.type, category: mv.category, basePower: mv.basePower,
		accuracy: mv.accuracy, pp: mv.pp, priority: mv.priority, shortDesc: mv.shortDesc || mv.desc || '',
	};
}

const items = {};
for (const it of dex.items.all()) {
	if (it.isNonstandard && it.isNonstandard !== 'Past') continue;
	items[it.id] = { id: it.id, name: it.name, desc: it.shortDesc || it.desc || '' };
}
const abilities = {};
for (const ab of dex.abilities.all()) {
	if (ab.isNonstandard && ab.isNonstandard !== 'Past') continue;
	abilities[ab.id] = { id: ab.id, name: ab.name, desc: ab.shortDesc || ab.desc || '' };
}
const natures = {};
for (const na of dex.natures.all()) natures[na.id] = { name: na.name, plus: na.plus || null, minus: na.minus || null };

write('species.json', species);
write('moves.json', moves);
write('items.json', items);
write('abilities.json', abilities);
write('natures.json', natures);
for (const [bucket, data] of Object.entries(learnsets)) write(path.join('learnsets', `${bucket}.json`), data);
write('meta.json', {
	generated_at: new Date().toISOString(),
	ps_commit: execSync('git rev-parse --short HEAD', { cwd: PS_DIR }).toString().trim(),
	counts: { species: Object.keys(species).length, moves: Object.keys(moves).length },
	formats: { league: LEAGUE, sparring: 'gen9pglsparring' },
});
console.log(`Dex exportado a ${OUT}`);
```

Notas para quien lo escriba: `dex.species.getMovePool(id, true)` ya resuelve prevos y
`learnsetParent` (ver `sim/dex-species.ts:633`); `ruleTable.isBannedSpecies` es la banlist real del
formato (`sim/dex-formats.ts:83`), así que Crowned/Rider salen marcados sin duplicar listas.
`gen` se toma de la **especie base** porque las formas regionales heredan la generación de su base
(es lo que ya hace `validateLeagueTeam` en `config/formats.ts:104`).

- [x] **Paso 4: generar y verificar**

```bash
cd /Users/jazar/Documents/GitHub/pokemon-showdown && node build
cd /Users/jazar/Documents/GitHub/bats && node tools/export_dex.js && node tools/check_dex_export.js
du -sh web/public/dex          # referencia: debe quedar por debajo de 6 MB
```
Expected: todas las líneas con `✓`, salida 0.

- [x] **Paso 5: commit**

```bash
cd /Users/jazar/Documents/GitHub/bats
git add tools/export_dex.js tools/check_dex_export.js web/public/dex
git commit -m "feat(dex): exporta el dex del fork de Showdown a JSON

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Espejo del dex en Postgres

**Files:**
- Create: `bats/bats_core/db/migrations/v11.sql`, `bats/bats_core/dex.py`
- Modify: `bats/bats_core/cli.py` (subcomando `dex`), `bats/bats_core/db/schema.sql` (no tocar: v11
  es aditiva y `--apply-schema` la aplica sola)
- Test: `bats/tests/test_dex.py`

**Interfaces:**
- Consume: `web/public/dex/species.json` y `meta.json` (Task 1).
- Produce: `bats_core.dex.import_snapshot(db, dex_dir) -> dict` (contadores),
  `bats_core.dex.species_meta(db, names: list[str]) -> dict[str, dict]` — clave = nombre tal cual lo
  manda el cliente, valor = fila de `dex_species` (o ausente si no existe la especie).
- Produce: CLI `python -m bats_core dex --import [--dir web/public/dex] [--dsn ...]`.

- [x] **Paso 1: escribir los tests**

`bats/tests/test_dex.py`, siguiendo el patrón de `tests/test_rules.py` (base desechable vía
`BATS_TEST_DSN`, `@unittest.skipUnless`):

```python
import json, os, unittest
from bats_core import dex

DSN = os.environ.get("BATS_TEST_DSN")

SNAPSHOT = {
    "garchomp":  {"id": "garchomp", "name": "Garchomp", "num": 445, "types": ["Dragon", "Ground"],
                  "bst": 600, "color": "Blue", "eggGroups": ["Monster", "Dragon"], "gen": 4,
                  "tags": [], "spriteid": "garchomp", "baseSpecies": "Garchomp",
                  "restricted": False, "paradox": False, "ultraBeast": False, "pseudo": True,
                  "leagueLegal": True},
    "koraidon":  {"id": "koraidon", "name": "Koraidon", "num": 1007, "types": ["Fighting", "Dragon"],
                  "bst": 670, "color": "Red", "eggGroups": ["Undiscovered"], "gen": 9,
                  "tags": ["Restricted Legendary", "Paradox"], "spriteid": "koraidon",
                  "baseSpecies": "Koraidon", "restricted": True, "paradox": True,
                  "ultraBeast": False, "pseudo": False, "leagueLegal": True},
}


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestImportacionDelDex(unittest.TestCase):

    def test_importa_y_es_idempotente(self):
        with self.db() as db:                      # helper que crea la base y aplica el schema
            first = dex.import_snapshot(db, self.snapshot_dir())
            second = dex.import_snapshot(db, self.snapshot_dir())
            self.assertEqual(first["species"], 2)
            self.assertEqual(second["species"], 2)
            row = db.fetchone("SELECT COUNT(*) AS n FROM tournament.dex_species")
            self.assertEqual(row["n"], 2)

    def test_species_meta_resuelve_por_nombre_y_por_id(self):
        with self.db() as db:
            dex.import_snapshot(db, self.snapshot_dir())
            meta = dex.species_meta(db, ["Garchomp", "koraidon", "Missingno"])
            self.assertTrue(meta["Garchomp"]["is_pseudo"])
            self.assertTrue(meta["koraidon"]["is_paradox"])
            self.assertNotIn("Missingno", meta)

    def test_guarda_la_version_del_snapshot(self):
        with self.db() as db:
            dex.import_snapshot(db, self.snapshot_dir())
            row = db.fetchone("SELECT ps_commit, species_count FROM tournament.dex_meta")
            self.assertEqual(row["species_count"], 2)
            self.assertEqual(row["ps_commit"], "abc1234")
```

(El helper `snapshot_dir()` escribe `SNAPSHOT` y un `meta.json` con `ps_commit="abc1234"` en un
`tempfile.TemporaryDirectory`; `db()` replica el `setUpClass` de `tests/test_rules.py`.)

- [x] **Paso 2: correr para verlos fallar**

Run: `cd bats && BATS_TEST_DSN=postgresql://localhost/bats_dex_test pytest tests/test_dex.py -v`
(antes: `createdb bats_dex_test`)
Expected: FAIL — `ModuleNotFoundError: bats_core.dex`.

- [x] **Paso 3: migración v11**

`bats/bats_core/db/migrations/v11.sql`:

```sql
-- =============================================================================
-- BATS — Migración v11: espejo del dex de Showdown y validación de rosters
-- =============================================================================
-- El dex deja de resolverse contra PokéAPI en el cliente: se exporta del fork de
-- Showdown (tools/export_dex.js) y se importa aquí, para que la API valide los
-- registros con los mismos datos que el formato, sin confiar en el body.

CREATE TABLE IF NOT EXISTS tournament.dex_species (
  species_id     VARCHAR(60)  PRIMARY KEY,          -- id de Showdown: "garchomp"
  name           VARCHAR(80)  NOT NULL,
  national_dex   INT,
  types          VARCHAR(40)  NOT NULL,             -- "Dragon / Ground" (igual que pokemon_cache)
  color          VARCHAR(20),
  generation     SMALLINT,
  egg_groups     TEXT[]       NOT NULL DEFAULT '{}',
  bst            SMALLINT     NOT NULL DEFAULT 0,
  tags           TEXT[]       NOT NULL DEFAULT '{}',
  base_species   VARCHAR(80),
  sprite_id      VARCHAR(80),
  is_restricted  BOOLEAN      NOT NULL DEFAULT FALSE,
  is_paradox     BOOLEAN      NOT NULL DEFAULT FALSE,
  is_pseudo      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_ultra_beast BOOLEAN      NOT NULL DEFAULT FALSE,
  league_legal   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_dex_species_lower_name
  ON tournament.dex_species (LOWER(name));

-- Versión del snapshot importado (una sola fila).
CREATE TABLE IF NOT EXISTS tournament.dex_meta (
  only_row      BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (only_row),
  generated_at  TIMESTAMPTZ,
  ps_commit     VARCHAR(40),
  species_count INT         NOT NULL DEFAULT 0,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Veredicto del TeamValidator real de Showdown (lo devuelve el plugin bats-ingest).
ALTER TABLE tournament.roster
  ADD COLUMN IF NOT EXISTS validation_errors JSONB,
  ADD COLUMN IF NOT EXISTS validated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_commit  VARCHAR(40);
```

- [x] **Paso 4: `bats_core/dex.py`**

```python
"""
BATS — Espejo del dex de Showdown.

El snapshot lo genera tools/export_dex.js desde el fork de PS. Aquí se importa a
tournament.dex_species para que la API valide equipos con los mismos datos que usa
config/formats.ts, sin depender de PokéAPI ni del body del cliente.
"""
import json
from pathlib import Path

COLUMNS = ("species_id", "name", "national_dex", "types", "color", "generation", "egg_groups",
           "bst", "tags", "base_species", "sprite_id", "is_restricted", "is_paradox",
           "is_pseudo", "is_ultra_beast", "league_legal")


def _row(sp: dict) -> tuple:
    return (
        sp["id"], sp["name"], sp.get("num"), " / ".join(sp.get("types") or []),
        sp.get("color"), sp.get("gen"), sp.get("eggGroups") or [], sp.get("bst") or 0,
        sp.get("tags") or [], sp.get("baseSpecies"), sp.get("spriteid"),
        bool(sp.get("restricted")), bool(sp.get("paradox")), bool(sp.get("pseudo")),
        bool(sp.get("ultraBeast")), bool(sp.get("leagueLegal", True)),
    )


def import_snapshot(db, dex_dir: str | Path) -> dict:
    """Carga species.json y meta.json en la DB. Idempotente (upsert por species_id)."""
    dex_dir = Path(dex_dir)
    species = json.loads((dex_dir / "species.json").read_text())
    meta = json.loads((dex_dir / "meta.json").read_text())
    placeholders = ", ".join(["%s"] * len(COLUMNS))
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in COLUMNS if c != "species_id")
    for sp in species.values():
        db.execute(
            f"INSERT INTO tournament.dex_species ({', '.join(COLUMNS)}) VALUES ({placeholders}) "
            f"ON CONFLICT (species_id) DO UPDATE SET {updates}",
            _row(sp),
        )
    db.execute(
        """
        INSERT INTO tournament.dex_meta (only_row, generated_at, ps_commit, species_count, imported_at)
        VALUES (TRUE, %s, %s, %s, NOW())
        ON CONFLICT (only_row) DO UPDATE SET
            generated_at = EXCLUDED.generated_at, ps_commit = EXCLUDED.ps_commit,
            species_count = EXCLUDED.species_count, imported_at = NOW()
        """,
        (meta.get("generated_at"), meta.get("ps_commit"), len(species)),
    )
    return {"species": len(species), "ps_commit": meta.get("ps_commit")}


def species_meta(db, names: list[str]) -> dict[str, dict]:
    """
    Metadatos de cada especie, indexados por el nombre TAL CUAL lo mandó el cliente.
    Resuelve por id de Showdown (toID) y por nombre en minúsculas; lo que no existe
    simplemente no aparece en el resultado (quien llama decide si es error).
    """
    if not names:
        return {}
    keys = {n: "".join(ch for ch in n.lower() if ch.isalnum()) for n in names}
    rows = db.fetchall(
        "SELECT * FROM tournament.dex_species WHERE species_id = ANY(%s) OR LOWER(name) = ANY(%s)",
        (list(keys.values()), [n.lower() for n in names]),
    )
    by_id = {r["species_id"]: r for r in rows}
    by_name = {r["name"].lower(): r for r in rows}
    out = {}
    for original, key in keys.items():
        row = by_id.get(key) or by_name.get(original.lower())
        if row:
            out[original] = dict(row)
    return out
```

- [x] **Paso 5: subcomando `dex` en el CLI**

En `bats_core/cli.py`, junto a los demás `subparsers.add_parser` (~línea 1041):

```python
    dex_parser = subparsers.add_parser(
        "dex", help="Importa el snapshot del dex de Showdown (tools/export_dex.js) a la base.")
    dex_parser.add_argument("--import", dest="do_import", action="store_true",
                            help="Importa species.json y meta.json a tournament.dex_species.")
    dex_parser.add_argument("--dir", default="web/public/dex", help="Carpeta del snapshot.")
    dex_parser.add_argument("--dsn", help="DSN alternativo (por defecto BATS_DB_DSN).")
```

y en el despacho del subcomando:

```python
    if args.subcommand == "dex":
        if not args.do_import:
            dex_parser.error("Usa --import.")
        from . import dex as dex_module
        with get_db(args.dsn) as db:
            result = dex_module.import_snapshot(db, args.dir)
        print(f"Dex importado: {result['species']} especies (PS {result['ps_commit']}).")
        return
```

- [x] **Paso 6: tests en verde**

```bash
cd /Users/jazar/Documents/GitHub/bats
BATS_TEST_DSN=postgresql://localhost/bats_dex_test pytest tests/test_dex.py -v
```
Expected: 3 passed.

- [x] **Paso 7: commit**

```bash
git add bats_core/dex.py bats_core/db/migrations/v11.sql bats_core/cli.py tests/test_dex.py
git commit -m "feat(dex): espejo del dex en tournament.dex_species + subcomando dex --import

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Las reglas se verifican en el servidor con el dex

**Files:**
- Modify: `bats/bats_core/rules.py`, `bats/bats_core/api/routes/teams.py`
- Test: `bats/tests/test_rules.py`

**Interfaces:**
- Consume: `bats_core.dex.species_meta` (Task 2).
- Produce: `rules.check_team(entries, restrictions, type_of_month=None)` sigue con la misma firma,
  pero `entries` ahora trae `is_paradox`, `is_pseudo`, `is_ultra_beast`, `is_restricted`,
  `league_legal` y `bst`, resueltos en el servidor.
- Produce: `rules.resolve_entries(db, pokemon: list[PokemonEntry]) -> tuple[list[dict], list[str]]`
  — entradas enriquecidas + nombres que no existen en el dex.
- Produce: en `RESTRICTION_SPEC`, la clave nueva `roster_enforcement` (bool, default `False`).

- [x] **Paso 1: tests**

En `tests/test_rules.py`, clase nueva (sin DB: se le pasan las entradas ya enriquecidas):

```python
class TestReglasDelDex(unittest.TestCase):

    def test_limita_paradox(self):
        team = [mon("Great Tusk", is_paradox=True), mon("Iron Treads", is_paradox=True)]
        codes = [v["code"] for v in check_team(team, {"max_paradox": 1})]
        self.assertIn("max_paradox:2/1", codes)

    def test_limita_pseudo_legendarios(self):
        team = [mon("Garchomp", is_pseudo=True), mon("Dragonite", is_pseudo=True)]
        codes = [v["code"] for v in check_team(team, {"max_pseudo_legendary": 1})]
        self.assertIn("max_pseudo_legendary:2/1", codes)

    def test_prohibe_ultra_beasts_y_no_legales(self):
        codes = [v["code"] for v in check_team([mon("Buzzwole", is_ultra_beast=True)], {})]
        self.assertIn("ultra_beast:Buzzwole", codes)
        codes = [v["code"] for v in check_team([mon("Zacian-Crowned", league_legal=False)], {})]
        self.assertIn("not_legal:Zacian-Crowned", codes)

    def test_un_solo_restricted(self):
        team = [mon("Koraidon", is_restricted=True), mon("Miraidon", is_restricted=True)]
        codes = [v["code"] for v in check_team(team, {})]
        self.assertIn("max_restricted:2/1", codes)

    def test_checklist_incluye_las_reglas_del_dex(self):
        rows = {r["rule"] for r in rule_checklist([mon("Garchomp", is_pseudo=True)], {})}
        self.assertIn("max_paradox", rows)
        self.assertIn("max_pseudo_legendary", rows)

    def test_roster_enforcement_es_una_restriccion(self):
        self.assertIn("roster_enforcement", RESTRICTION_SPEC)
        self.assertIs(normalize_restrictions({})["roster_enforcement"], False)
```

Y un test con DB, en `TestRegistroConReglas`, que es el que cierra el agujero de seguridad:

```python
    def test_no_confia_en_los_metadatos_del_cliente(self):
        """El cliente declara color amarillo; el dex dice azul: el registro se rechaza."""
        self._set_restrictions({"required_color": "yellow"})
        body = {"pokemon": [{"name": "Garchomp", "color": "yellow", "generation": 4,
                             "egg_groups": ["dragon"], "types": "Dragon / Ground", "moves": []}]}
        res = self.client.post("/api/teams/me", json=body)
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()["detail"], "missing_color:yellow")
```

- [x] **Paso 2: correr y verlos fallar**

Run: `BATS_TEST_DSN=postgresql://localhost/bats_dex_test pytest tests/test_rules.py -v`
Expected: FAIL — `KeyError: 'roster_enforcement'` y los códigos nuevos no aparecen.

- [x] **Paso 3: implementar**

En `rules.py`:

1. Añadir a `RESTRICTION_SPEC` (después de `registration_closed`):

```python
    "roster_enforcement": {
        "type":    "bool",
        "default": False,
        "label":   "Exigir el equipo registrado",
        "hint":    "Showdown rechaza en batalla cualquier set que no esté registrado en BATS.",
    },
    "max_restricted": {
        "type":    "int",
        "min":     0,
        "max":     6,
        "default": 1,
        "label":   "Máximo de legendarios restringidos",
        "hint":    "Cuántos Sub-Legendary / Restricted Legendary / Mythical admite un equipo.",
    },
```

2. En `check_team`, tras las comprobaciones actuales (y **antes** del `return`), añadir las que
   ahora sí tienen datos. Actualizar el docstring: ya no son "las que solo tiene el dex de PS".

```python
    # Reglas que antes solo podía aplicar config/formats.ts: ahora los metadatos vienen
    # de tournament.dex_species (bats_core/dex.py), no del body del cliente.
    illegal = [e["name"] for e in entries if e.get("league_legal") is False]
    if illegal:
        violations.append({"rule": "not_legal", "code": f"not_legal:{','.join(illegal)}", "names": illegal})

    ubs = [e["name"] for e in entries if e.get("is_ultra_beast")]
    if ubs:
        violations.append({"rule": "ultra_beast", "code": f"ultra_beast:{','.join(ubs)}", "names": ubs})

    for key, flag in (("max_paradox", "is_paradox"),
                      ("max_pseudo_legendary", "is_pseudo"),
                      ("max_restricted", "is_restricted")):
        limit = rules[key]
        hits = [e["name"] for e in entries if e.get(flag)]
        if len(hits) > limit:
            violations.append({"rule": key, "code": f"{key}:{len(hits)}/{limit}", "names": hits})
```

3. En `rule_checklist`, añadir una fila por cada uno de esos límites (siempre visibles, como las
   demás), con etiquetas del tipo `f"Máximo {limit} Paradox ({len(hits)}/{limit})"`.

4. Función nueva al final del módulo:

```python
def resolve_entries(db, pokemon: list) -> tuple[list[dict], list[str]]:
    """
    Enriquece los pokémon que manda el cliente con los metadatos reales del dex.
    Lo que el cliente diga de color/generación/egg groups se IGNORA: manda dex_species.
    Devuelve (entradas, desconocidos).
    """
    from .dex import species_meta
    names = [p.name if hasattr(p, "name") else p["name"] for p in pokemon]
    meta = species_meta(db, names)
    entries, unknown = [], []
    for p in pokemon:
        raw = p.model_dump() if hasattr(p, "model_dump") else dict(p)
        info = meta.get(raw["name"])
        if not info:
            unknown.append(raw["name"])
            continue
        raw.update({
            "types": info["types"], "color": info["color"], "generation": info["generation"],
            "egg_groups": list(info["egg_groups"] or []), "bst": info["bst"],
            "is_paradox": info["is_paradox"], "is_pseudo": info["is_pseudo"],
            "is_restricted": info["is_restricted"], "is_ultra_beast": info["is_ultra_beast"],
            "league_legal": info["league_legal"], "national_dex": info["national_dex"],
            "sprite_id": info["sprite_id"],
        })
        entries.append(raw)
    return entries, unknown
```

5. En `routes/teams.py`, sustituir los tres sitios que hacen
   `check_team([p.model_dump() for p in body.pokemon], ...)` y el `rule_checklist` de
   `/me/validate` por `entries, unknown = resolve_entries(db, body.pokemon)`, con
   `HTTPException(422, detail=f"unknown_species:{','.join(unknown)}")` si hay desconocidos. En
   `_upsert_pokemon`, pasar los valores del dex (no los del body).

- [x] **Paso 4: tests en verde**

Run: `BATS_TEST_DSN=postgresql://localhost/bats_dex_test pytest tests/test_rules.py tests/test_features.py -v`
Expected: PASS (incluye los tests que ya existían).

- [x] **Paso 5: commit**

```bash
git add bats_core/rules.py bats_core/api/routes/teams.py tests/test_rules.py
git commit -m "feat(reglas): valida Paradox, pseudo, UB y legalidad en el servidor con el dex

Los metadatos de cada especie salen de tournament.dex_species, no del body.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Fase 2 — API: sets completos, edición libre y sincronización

### Task 4: Forma canónica de un set

**Files:**
- Create: `bats/bats_core/teamset.py`, `bats/tests/test_teamset.py`,
  `bats/tests/fixtures/sets_canonicos.json`

**Interfaces:**
- Produce: `teamset.canonical_set(entry: dict, primary_type: str | None = None) -> str`.
- Produce: `tests/fixtures/sets_canonicos.json` = `[{ "set": {...}, "canonical": "..." }]`, el
  contrato que `config/formats.ts` tendrá que reproducir (Task 8).

**Formato canónico** (lo que compara Showdown en batalla):

```
<speciesid>|<itemid>|<abilityid>|<natureid>|<teraid>|<moveids ordenados, coma>|<evs>|<ivs>
```
con `toID` = minúsculas sin caracteres no alfanuméricos; EVs/IVs siempre como seis números
`hp,atk,def,spa,spd,spe` (EV ausente = 0, IV ausente = 31); tera vacío = tipo primario de la especie.
Se ignoran apodo, nivel, género, shiny y felicidad.

- [x] **Paso 1: test**

```python
"""tests/test_teamset.py — forma canónica de un set (la compara config/formats.ts)."""
import json, unittest
from pathlib import Path
from bats_core.teamset import canonical_set

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "sets_canonicos.json").read_text())


class TestCanonicalSet(unittest.TestCase):

    def test_fixtures(self):
        for case in FIXTURES:
            with self.subTest(case["set"]["name"]):
                self.assertEqual(canonical_set(case["set"], case.get("primary_type")), case["canonical"])

    def test_el_orden_de_los_movimientos_no_importa(self):
        a = {"name": "Garchomp", "moves": ["Earthquake", "Spikes"], "ability": "Rough Skin"}
        b = {"name": "Garchomp", "moves": ["Spikes", "Earthquake"], "ability": "Rough Skin"}
        self.assertEqual(canonical_set(a), canonical_set(b))

    def test_el_apodo_no_importa(self):
        a = {"name": "Garchomp", "nickname": "Chompy", "moves": []}
        self.assertEqual(canonical_set(a), canonical_set({"name": "Garchomp", "moves": []}))

    def test_cambiar_un_ev_cambia_la_forma(self):
        a = {"name": "Garchomp", "moves": [], "evs": {"HP": 252}}
        b = {"name": "Garchomp", "moves": [], "evs": {"HP": 248}}
        self.assertNotEqual(canonical_set(a), canonical_set(b))

    def test_tera_vacio_usa_el_tipo_primario(self):
        sin_tera = canonical_set({"name": "Garchomp", "moves": []}, primary_type="Dragon")
        con_tera = canonical_set({"name": "Garchomp", "moves": [], "tera_type": "Dragon"})
        self.assertEqual(sin_tera, con_tera)
```

`tests/fixtures/sets_canonicos.json` con al menos 6 casos (set completo, sin item, sin EVs, con IVs
parciales, con tera explícito, con nombre de forma `Urshifu-Rapid-Strike`). Ejemplo del primero:

```json
[
  {
    "set": {"name": "Garchomp", "held_item": "Rocky Helmet", "ability": "Rough Skin",
            "nature": "Impish", "tera_type": "Steel",
            "moves": ["Earthquake", "Dragon Tail", "Stealth Rock", "Spikes"],
            "evs": {"HP": 252, "Atk": 4, "SpD": 252}, "ivs": {}},
    "canonical": "garchomp|rockyhelmet|roughskin|impish|steel|dragontail,earthquake,spikes,stealthrock|252,4,0,0,252,0|31,31,31,31,31,31"
  }
]
```

- [x] **Paso 2: correr y verlo fallar**

Run: `cd bats && pytest tests/test_teamset.py -v` → FAIL (`ModuleNotFoundError: bats_core.teamset`).

- [x] **Paso 3: implementar**

```python
"""
BATS — Forma canónica de un set de Showdown.

Es el contrato que compara config/formats.ts en batalla: si el set que trae el jugador
no produce la misma cadena que uno de sus sets registrados, el formato lo rechaza.
La versión en TypeScript vive en config/formats.ts (canonicalSet) y tools/roster_parity.js
comprueba que las dos coinciden sobre tests/fixtures/sets_canonicos.json.
"""
STATS = ("hp", "atk", "def", "spa", "spd", "spe")


def to_id(value) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def _spread(raw: dict | None, default: int) -> str:
    raw = {to_id(k): v for k, v in (raw or {}).items()}
    return ",".join(str(int(raw.get(stat, default))) for stat in STATS)


def canonical_set(entry: dict, primary_type: str | None = None) -> str:
    moves = sorted(to_id(m) for m in (entry.get("moves") or []) if to_id(m))
    tera = to_id(entry.get("tera_type")) or to_id(primary_type)
    return "|".join([
        to_id(entry.get("name") or entry.get("species")),
        to_id(entry.get("held_item")),
        to_id(entry.get("ability")),
        to_id(entry.get("nature")),
        tera,
        ",".join(moves),
        _spread(entry.get("evs"), 0),
        _spread(entry.get("ivs"), 31),
    ])
```

- [x] **Paso 4: tests en verde**

Run: `pytest tests/test_teamset.py -v` → PASS.

- [x] **Paso 5: commit**

```bash
git add bats_core/teamset.py tests/test_teamset.py tests/fixtures/sets_canonicos.json
git commit -m "feat(teams): forma canónica de un set, con fixtures de contrato

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Editar un set registrado y publicar los rosters

**Files:**
- Modify: `bats/bats_core/api/routes/teams.py`, `bats/bats_core/api/schemas.py`,
  `bats/bats_core/api/main.py`
- Create: `bats/bats_core/api/routes/dex.py`
- Test: `bats/tests/test_features.py` (clase nueva `TestEdicionDeSets`)

**Interfaces:**
- Produce: `PATCH /api/teams/me/pokemon/{pokemon_id}` — cuerpo `PokemonEntry`; cambia item, ability,
  nature, tera, moves, EVs e IVs **sin** consumir cambios. Rechaza si cambia la especie (ahí va
  `/me/swap`) y si el registro está cerrado o el roster bloqueado.
- Produce: `GET /api/teams/rosters` (Bearer `BATS_INGEST_TOKEN`) →
  `{ "season_id": int, "enforcement": bool, "rosters": { "<username>": { "sets": ["<canonical>"],
  "paste": "<paste de Showdown>" } } }`. `paste` es lo que el plugin le pasa al TeamValidator.
- Produce: `GET /api/dex/meta` (público) → fila de `tournament.dex_meta`, para que el frontend avise
  si el snapshot estático y la base no coinciden.

- [x] **Paso 1: tests**

```python
@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestEdicionDeSets(unittest.TestCase):

    def test_editar_un_set_no_consume_cambios(self):
        self._registrar(["Garchomp", "Dragonite"])
        antes = self.client.get("/api/teams/me").json()["rotations_used"]
        res = self.client.patch(f"/api/teams/me/pokemon/{self._id('Garchomp')}", json={
            "name": "Garchomp", "moves": ["Swords Dance", "Earthquake"], "held_item": "Life Orb"})
        self.assertEqual(res.status_code, 200)
        despues = self.client.get("/api/teams/me").json()
        self.assertEqual(despues["rotations_used"], antes)
        chomp = next(p for p in despues["pool"] if p["name"] == "Garchomp")
        self.assertEqual(chomp["held_item"], "Life Orb")
        self.assertIn("Swords Dance", chomp["moves"])

    def test_no_se_puede_cambiar_la_especie_con_patch(self):
        self._registrar(["Garchomp"])
        res = self.client.patch(f"/api/teams/me/pokemon/{self._id('Garchomp')}",
                                json={"name": "Dragonite", "moves": []})
        self.assertEqual(res.status_code, 422)

    def test_editar_respeta_las_reglas(self):
        self._set_restrictions({"item_clause": True})
        self._registrar([("Garchomp", "Leftovers"), ("Dragonite", "Life Orb")])
        res = self.client.patch(f"/api/teams/me/pokemon/{self._id('Dragonite')}",
                                json={"name": "Dragonite", "held_item": "Leftovers", "moves": []})
        self.assertEqual(res.status_code, 422)
        self.assertTrue(res.json()["detail"].startswith("item_clause:"))

    def test_no_se_puede_editar_con_el_registro_cerrado(self):
        self._registrar(["Garchomp"])
        self._set_restrictions({"registration_closed": True})
        res = self.client.patch(f"/api/teams/me/pokemon/{self._id('Garchomp')}",
                                json={"name": "Garchomp", "moves": []})
        self.assertEqual(res.status_code, 409)


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestRostersParaShowdown(unittest.TestCase):

    def test_exige_el_token_de_ingesta(self):
        self.assertEqual(self.client.get("/api/teams/rosters").status_code, 401)

    def test_devuelve_sets_canonicos_y_paste(self):
        self._registrar(["Garchomp"])
        res = self.client.get("/api/teams/rosters", headers=self.ingest_headers)
        data = res.json()
        self.assertIn("pgl_tester", data["rosters"])
        self.assertTrue(data["rosters"]["pgl_tester"]["sets"][0].startswith("garchomp|"))
        self.assertIn("Garchomp", data["rosters"]["pgl_tester"]["paste"])

    def test_enforcement_sale_de_la_restriccion_de_la_temporada(self):
        self._set_restrictions({"roster_enforcement": True})
        res = self.client.get("/api/teams/rosters", headers=self.ingest_headers)
        self.assertTrue(res.json()["enforcement"])
```

- [x] **Paso 2: correr y verlos fallar**

Run: `BATS_TEST_DSN=postgresql://localhost/bats_dex_test pytest tests/test_features.py -k "Edicion or Rosters" -v`
Expected: FAIL — 405 en el PATCH, 404 en `/api/teams/rosters`.

- [x] **Paso 3: implementar**

En `schemas.py`, `class EditSetRequest(PokemonEntry): pass` (o reutilizar `PokemonEntry` tal cual).

En `routes/teams.py`:

```python
@router.patch("/me/pokemon/{pokemon_id}")
def edit_set(pokemon_id: int, body: PokemonEntry, player: dict = Depends(require_player)):
    """
    Cambia el set de un pokémon ya registrado (objeto, habilidad, naturaleza, tera,
    movimientos, EVs, IVs). NO consume cambios: la especie es lo que se congela, el set
    se puede afinar mientras el registro siga abierto. Para cambiar de especie, /me/swap.
    """
    username = player["username"].lower()
    with get_db() as db:
        season = _get_active_season(db)
        _ensure_open(season)
        _check_whitelist(db, username, season["season_id"])
        roster = db.fetchone(
            "SELECT roster_id, is_locked FROM tournament.roster WHERE season_id = %s AND LOWER(username) = %s",
            (season["season_id"], username))
        if not roster:
            raise HTTPException(status_code=404, detail="No hay equipo registrado.")
        if roster["is_locked"]:
            raise HTTPException(status_code=409, detail="roster_locked")

        current = db.fetchone(
            """SELECT pc.name FROM tournament.roster_pokemon rp
               JOIN tournament.pokemon_cache pc ON pc.pokemon_id = rp.pokemon_id
               WHERE rp.roster_id = %s AND rp.pokemon_id = %s""",
            (roster["roster_id"], pokemon_id))
        if not current:
            raise HTTPException(status_code=404, detail="El pokémon no está en el equipo.")
        if to_id(body.name) != to_id(current["name"]):
            raise HTTPException(status_code=422, detail="species_mismatch")

        # El equipo completo con el set nuevo, para comprobar reglas de conjunto (item clause…).
        pool = _pool_entries(db, roster["roster_id"], replace={pokemon_id: body})
        entries, unknown = resolve_entries(db, pool)
        if unknown:
            raise HTTPException(status_code=422, detail=f"unknown_species:{','.join(unknown)}")
        violations = check_team(entries, season["restrictions"])
        if violations:
            raise HTTPException(status_code=422, detail=violations[0]["code"])

        _insert_roster_pokemon(db, roster["roster_id"], pokemon_id, body)
    return {"ok": True}


@router.get("/rosters", dependencies=[Depends(require_ingest_token)])
def rosters_for_showdown():
    """
    Lo que el plugin bats-ingest guarda en active_rosters.json para que config/formats.ts
    rechace en batalla cualquier set que no esté registrado. Solo con token de servicio:
    los equipos son privados hasta que el admin cierra el registro.
    """
    with get_db() as db:
        season = _get_active_season(db)
        rows = db.fetchall(
            """SELECT LOWER(r.username) AS username, pc.name, ds.types,
                      rp.held_item, rp.ability, rp.nature, rp.tera_type, rp.moves, rp.evs, rp.ivs
               FROM tournament.roster r
               JOIN tournament.roster_pokemon rp ON rp.roster_id = r.roster_id
               JOIN tournament.pokemon_cache pc  ON pc.pokemon_id = rp.pokemon_id
               LEFT JOIN tournament.dex_species ds ON LOWER(ds.name) = LOWER(pc.name)
               WHERE r.season_id = %s
               ORDER BY r.username, rp.added_at""",
            (season["season_id"],))
    rosters: dict[str, dict] = {}
    for r in rows:
        entry = {"name": r["name"], "held_item": r["held_item"], "ability": r["ability"],
                 "nature": r["nature"], "tera_type": r["tera_type"],
                 "moves": r["moves"] or [], "evs": r["evs"] or {}, "ivs": r["ivs"] or {}}
        primary = (r["types"] or "").split("/")[0].strip() or None
        bucket = rosters.setdefault(r["username"], {"sets": [], "paste": []})
        bucket["sets"].append(canonical_set(entry, primary))
        bucket["paste"].append(to_paste(entry))
    return {
        "season_id":   season["season_id"],
        "enforcement": normalize_restrictions(season["restrictions"])["roster_enforcement"],
        "rosters":     {u: {"sets": v["sets"], "paste": "\n\n".join(v["paste"])} for u, v in rosters.items()},
    }
```

Hace falta además:
- `require_ingest_token` en `teams.py` — importarlo de `..auth` (`service_token("BATS_INGEST_TOKEN")`,
  el mismo que usa `routes/ingest.py`).
- `_pool_entries(db, roster_id, replace=None)` — helper nuevo que devuelve el pool actual como dicts,
  sustituyendo un slot; lo reutilizan el PATCH y `/me/validate`.
- `to_paste(entry)` en `teamset.py` — espejo en Python de `web/src/lib/showdown.ts::toPaste`, con su
  test (`test_teamset.py::test_paste_de_un_set`).
- `routes/dex.py` con `GET /api/dex/meta` y su registro en `api/main.py`.
- **`vercel.json`**: añadir `bats_core/{dex,teamset}.py` al bundle — están dentro de `bats_core/**`,
  así que basta con comprobar que el `excludeFiles` no los excluye; hoy excluye
  `bats_core/{cli,metrics,report,pokeapi,bans,backfill,mvp}.py`, así que **no hay que tocar nada**,
  pero sí verificarlo (`bats_core/pokeapi.py` sigue excluido y ya no lo usa nadie del lado API).

- [x] **Paso 4: tests en verde**

Run: `BATS_TEST_DSN=postgresql://localhost/bats_dex_test pytest tests/ -v`
Expected: PASS (todo lo anterior incluido).

- [x] **Paso 5: commit**

```bash
git add bats_core/api bats_core/teamset.py tests/test_features.py
git commit -m "feat(teams): PATCH de sets sin consumir cambios y GET /api/teams/rosters

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Veredicto del validador real de Showdown

**Files:**
- Modify: `bats/bats_core/api/routes/ingest.py`, `bats/bats_core/api/schemas.py`,
  `bats/bats_core/api/routes/teams.py` (`_load_roster` expone el veredicto)
- Test: `bats/tests/test_ingest.py`

**Interfaces:**
- Produce: `POST /api/ingest/roster-validation` (Bearer `BATS_INGEST_TOKEN`), cuerpo
  `{ "ps_commit": str | None, "results": { "<username>": ["<error>", ...] } }` → guarda en
  `tournament.roster.validation_errors / validated_at / validated_commit`. Lista vacía = equipo OK.
- Produce: `GET /api/teams/me` incluye
  `"validation": { "state": "ok" | "errors" | "pending", "errors": [...], "checked_at": iso }`.

- [x] **Paso 1: tests**

```python
    def test_guarda_el_veredicto_del_validador(self):
        self._registrar(["Garchomp"])
        res = self.client.post("/api/ingest/roster-validation", headers=self.ingest_headers, json={
            "ps_commit": "abc1234",
            "results": {"pgl_tester": ["Garchomp no aprende Psychic."]}})
        self.assertEqual(res.status_code, 200)
        team = self.client.get("/api/teams/me").json()
        self.assertEqual(team["validation"]["state"], "errors")
        self.assertIn("Garchomp no aprende Psychic.", team["validation"]["errors"])

    def test_lista_vacia_significa_equipo_valido(self):
        self._registrar(["Garchomp"])
        self.client.post("/api/ingest/roster-validation", headers=self.ingest_headers,
                         json={"ps_commit": "abc1234", "results": {"pgl_tester": []}})
        self.assertEqual(self.client.get("/api/teams/me").json()["validation"]["state"], "ok")

    def test_sin_veredicto_queda_pendiente(self):
        self._registrar(["Garchomp"])
        self.assertEqual(self.client.get("/api/teams/me").json()["validation"]["state"], "pending")

    def test_exige_token(self):
        self.assertEqual(self.client.post("/api/ingest/roster-validation", json={"results": {}}).status_code, 401)

    def test_ignora_jugadores_sin_roster(self):
        res = self.client.post("/api/ingest/roster-validation", headers=self.ingest_headers,
                               json={"results": {"nadie": ["x"]}})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["updated"], 0)
```

- [x] **Paso 2: correr y verlos fallar** → 404 en la ruta nueva.

- [x] **Paso 3: implementar** el endpoint (una sola transacción, `UPDATE ... WHERE season_id = %s AND
LOWER(username) = %s`, devolviendo `{"ok": True, "updated": n}`) y el bloque `validation` en
`_load_roster`.

- [x] **Paso 4: tests en verde** — `pytest tests/test_ingest.py -v`.

- [x] **Paso 5: commit** — `feat(ingest): guarda el veredicto del TeamValidator de Showdown`.

---

# Fase 3 — Showdown hace cumplir el equipo registrado

### Task 7: Exponer al validador quién está validando

**Files:**
- Modify: `pokemon-showdown/sim/team-validator.ts`, `pokemon-showdown/sim/dex-formats.ts`
- Test: `pokemon-showdown/test/sim/team-validator.js` (o el archivo de tests de formatos existente)

**Por qué:** `onValidateTeam(team, format, teamHas)` no recibe la identidad del jugador
(`sim/team-validator.ts:474-480`), pero `options.user` sí llega a `validateTeam` en tiempo de
ejecución desde `server/team-validator-async.ts:25` (lo pone `server/ladders.ts:110,124`). Sin
el usuario no se puede comparar el equipo contra *su* roster.

**Interfaces:**
- Produce: `TeamValidator.validatingUser: ID | null`, asignado al principio de `baseValidateTeam` y
  legible desde `onValidateTeam` (que se invoca con `.call(this, …)`).

- [x] **Paso 1: test**

```js
describe('TeamValidator (parche BATS)', () => {
	it('expone el usuario que valida a onValidateTeam', () => {
		const validator = TeamValidator.get('gen9customgame@@@-nonexistent');
		let visto = null;
		const format = validator.format;
		Object.defineProperty(format, 'onValidateTeam', {
			configurable: true,
			value(team) { visto = this.validatingUser; },
		});
		validator.validateTeam([{species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'],
			evs: {}, ivs: {}, level: 100, name: 'Pikachu'}], {user: 'pglpepe'});
		assert.equal(visto, 'pglpepe');
	});

	it('no arrastra el usuario de una validación a la siguiente', () => { /* valida sin `user` y comprueba null */ });
});
```

- [x] **Paso 2: correr y verlo fallar**

Run: `cd pokemon-showdown && npx mocha test/sim/team-validator.js -g "parche BATS"`
Expected: FAIL — `visto` es `undefined`.

- [x] **Paso 3: parche**

En `sim/team-validator.ts`, clase `TeamValidator`, junto a los demás campos:

```ts
	/**
	 * PARCHE BATS — quién está validando. `options.user` ya viaja desde
	 * server/ladders.ts hasta aquí, pero no llegaba a `onValidateTeam`, y
	 * config/formats.ts lo necesita para comparar el equipo con el roster
	 * registrado en BATS. Conservar en los merges con upstream.
	 */
	validatingUser: ID | null = null;
```

en `validateTeam` y `baseValidateTeam`, añadir `user?: ID` al tipo de `options`, y como primera línea
de `baseValidateTeam`:

```ts
		this.validatingUser = options.user || null;
```

- [x] **Paso 4: verificar**

```bash
cd /Users/jazar/Documents/GitHub/pokemon-showdown
npx tsc --noEmit            # debe seguir con el único error preexistente de battle-teams.ts
npx eslint sim/team-validator.ts
npx mocha test/sim/team-validator.js -g "parche BATS"
```
Expected: test PASS, sin errores nuevos de tsc/eslint.

- [x] **Paso 5: commit**

```bash
cd /Users/jazar/Documents/GitHub/pokemon-showdown
git add sim/team-validator.ts test/sim/team-validator.js
git commit -m "feat(bats): expone validatingUser a onValidateTeam

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: El formato rechaza sets no registrados

**Files:**
- Modify: `pokemon-showdown/config/formats.ts`
- Create: `bats/tools/roster_parity.js`
- Test: `pokemon-showdown/test/sim/...` (equipo válido/ inválido) + `tools/roster_parity.js`

**Interfaces:**
- Consume: `active_rosters.json` en la raíz de PS (lo escribe el plugin, Task 9):
  `{ season_id, enforcement, rosters: { "<userid>": { "sets": ["<canonical>"] } } }`.
- Produce: `canonicalSet(dex, set): string` en `config/formats.ts` — espejo exacto de
  `bats_core/teamset.py::canonical_set`.

- [x] **Paso 1: test de paridad entre los dos lenguajes**

`bats/tools/roster_parity.js` — carga las fixtures de la Task 4 y las pasa por la implementación de
TypeScript compilada (`dist/config/formats.js` exporta `canonicalSet` para pruebas):

```js
'use strict';
const path = require('path');
const fs = require('fs');
const PS_DIR = process.env.BATS_PS_DIR || path.resolve(__dirname, '..', '..', 'pokemon-showdown');
const { Dex } = require(path.join(PS_DIR, 'dist/sim/dex'));
const { canonicalSet } = require(path.join(PS_DIR, 'dist/config/formats'));

const cases = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'tests', 'fixtures', 'sets_canonicos.json'), 'utf8'));
let fails = 0;
for (const c of cases) {
	const set = {
		species: c.set.name, item: c.set.held_item || '', ability: c.set.ability || '',
		nature: c.set.nature || '', teraType: c.set.tera_type || '', moves: c.set.moves || [],
		evs: c.set.evs || {}, ivs: c.set.ivs || {},
	};
	const got = canonicalSet(Dex.forFormat('gen9pinchesgueysleague'), set);
	if (got !== c.canonical) { console.error(`✗ ${c.set.name}\n  py: ${c.canonical}\n  ts: ${got}`); fails++; }
	else console.log(`✓ ${c.set.name}`);
}
process.exit(fails ? 1 : 0);
```

Y en `bats/tests/test_teamset.py`, un test que corre ese script si hay `dist/` compilado
(`unittest.skipUnless(Path(PS_DIR, "dist/config/formats.js").exists(), ...)`), para que la paridad
también falle desde pytest.

- [x] **Paso 2: correr y verlo fallar**

Run: `cd bats && node tools/roster_parity.js` → FAIL (`canonicalSet is not a function`).

- [x] **Paso 3: implementar en `config/formats.ts`**

Junto a `loadLeagueRules()` (mismo patrón: leer el archivo en cada validación, caer con gracia si no
existe):

```ts
interface ActiveRosters {
	enforcement: boolean;
	rosters: { [userid: string]: { sets: string[] } };
}

function loadActiveRosters(): ActiveRosters | null {
	try {
		const rostersPath = path.resolve(process.cwd(), 'active_rosters.json');
		if (!fs.existsSync(rostersPath)) return null;
		return JSON.parse(fs.readFileSync(rostersPath, 'utf8')) as ActiveRosters;
	} catch {
		return null;   // archivo corrupto: no bloquear a nadie
	}
}

const STAT_IDS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

/**
 * Forma canónica de un set. Espejo EXACTO de bats_core/teamset.py::canonical_set en BATS;
 * bats/tools/roster_parity.js comprueba que las dos coinciden. Si cambias una, cambia la otra.
 */
export function canonicalSet(dex: ModdedDex, set: PokemonSet): string {
	const species = dex.species.get(set.species);
	const spread = (raw: Partial<StatsTable> | undefined, def: number) =>
		STAT_IDS.map(s => String((raw as any)?.[s] ?? def)).join(',');
	const moves = (set.moves || []).map(m => toID(m)).filter(Boolean).sort();
	return [
		toID(species.name), toID(set.item), toID(set.ability), toID(set.nature),
		toID(set.teraType || species.types[0]), moves.join(','),
		spread(set.evs, 0), spread(set.ivs, 31),
	].join('|');
}
```

y dentro de `validateLeagueTeam`, antes del `return`:

```ts
	// Equipo registrado en BATS: en batalla solo valen los sets que el jugador registró.
	const rosterData = loadActiveRosters();
	const userid = (this as any).validatingUser as string | null;   // parche de sim/team-validator.ts
	if (monthly && rosterData?.enforcement && userid) {
		const roster = rosterData.rosters[userid];
		if (!roster) {
			errors.push(`No tienes un equipo registrado en BATS. Regístralo antes de batallar.`);
		} else {
			const registered = new Set(roster.sets);
			for (const set of team) {
				if (!registered.has(canonicalSet(dex, set))) {
					errors.push(
						`${dex.species.get(set.species).name} no coincide con ningún set registrado en BATS ` +
						`(objeto, habilidad, naturaleza, tera, movimientos, EVs e IVs deben ser idénticos).`
					);
				}
			}
		}
	}
```

Nota: `validateLeagueTeam` recibe `dex` como primer parámetro y se llama con `this.dex` desde
`onValidateTeam`; para leer `validatingUser` hay que pasar también el validador, así que cambia la
firma a `validateLeagueTeam(validator: TeamValidator, team, monthly)` y dentro
`const dex = validator.dex;`. Las dos llamadas (`config/formats.ts:174` y `:200`) pasan a
`validateLeagueTeam(this, team, true|false)`.

- [x] **Paso 4: verificar**

```bash
cd /Users/jazar/Documents/GitHub/pokemon-showdown && node build && npx eslint config/formats.ts
cd /Users/jazar/Documents/GitHub/bats && node tools/roster_parity.js
```
Expected: paridad ✓ en todas las fixtures.

Prueba manual en sandbox (**sin tocar el `active_rosters.json` real**): copiar el fork a un
`BATS_PS_DIR` temporal, escribir ahí un `active_rosters.json` con un set conocido y validar dos
equipos con `node bats_core/validate_team.js` (uno idéntico al registrado, otro con un movimiento
cambiado). El segundo debe fallar con el mensaje nuevo.

- [x] **Paso 5: commit** (en los dos repos: `formats.ts` en PS, `tools/roster_parity.js` en BATS).

---

### Task 9: El plugin sincroniza rosters y devuelve el veredicto

**Files:**
- Modify: `pokemon-showdown/server/chat-plugins/bats-ingest.ts`
- Test: `pokemon-showdown/test/server/chat-plugins/bats-ingest.js`

**Interfaces:**
- Consume: `GET /api/teams/rosters` (Task 5), `POST /api/ingest/roster-validation` (Task 6).
- Produce: `active_rosters.json` en la raíz de PS y el POST del veredicto tras cada sincronización.

- [x] **Paso 1: test**

Con `nofswriting = true` y `Chat.loadPlugins()`, mockeando `fetch` (ver `test/server/` para el
patrón): `syncRosters()` escribe el archivo con lo que responde la API; si la API devuelve error o un
formato inesperado, **no** toca el archivo (mismo contrato que `syncBans`); tras escribir, hace un
POST con una entrada por jugador.

- [x] **Paso 2: correr y verlo fallar.**

- [x] **Paso 3: implementar** — copiar la forma de `syncRules()` (`bats-ingest.ts:144`):

```ts
async function syncRosters() {
	const { url, token } = settings();
	if (!url || !token) return;
	try {
		const res = await fetch(`${url}/api/teams/rosters`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!res.ok) {
			Monitor.warn(`[bats-ingest] sync de rosters: HTTP ${res.status}`);
			return;   // sin temporada activa o API caída: no tocar el archivo actual
		}
		const data = await res.json() as { rosters?: unknown, enforcement?: unknown };
		if (typeof data.rosters !== 'object' || data.rosters === null || Array.isArray(data.rosters)) {
			Monitor.warn(`[bats-ingest] sync de rosters: respuesta con formato inesperado`);
			return;
		}
		const next = JSON.stringify(data, null, 2);
		const file = FS('active_rosters.json');
		if ((await file.readIfExists()).trim() === next) return;
		await file.write(next + '\n');
		Monitor.notice(`[bats-ingest] active_rosters.json actualizado (${Object.keys(data.rosters).length} equipos).`);
		await validateRosters(data as any);
	} catch (e: any) {
		Monitor.warn(`[bats-ingest] sync de rosters: ${e?.message || e}`);
	}
}

/** Doble comprobación: pasa cada equipo registrado por el TeamValidator real y devuelve los errores a BATS. */
async function validateRosters(data: { rosters: { [u: string]: { paste: string } } }) {
	const { url, token } = settings();
	const results: { [userid: string]: string[] } = {};
	for (const [userid, roster] of Object.entries(data.rosters)) {
		try {
			const sets = Teams.import(roster.paste);
			results[userid] = sets?.length
				? (TeamValidator.get('gen9pinchesgueysleague').validateTeam(sets) ?? [])
				: ['No se pudo leer el equipo registrado.'];
		} catch (e: any) {
			results[userid] = [`Error del validador: ${e?.message || e}`];
		}
	}
	try {
		await fetch(`${url}/api/ingest/roster-validation`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ ps_commit: null, results }),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 3),
		});
	} catch (e: any) {
		Monitor.warn(`[bats-ingest] veredicto de rosters: ${e?.message || e}`);
	}
}
```

y añadir `void syncRosters();` al `syncAll()` de `start()` (junto a `syncBans` y `syncRules`).
El equipo registrado tiene hasta 8 pokémon y el formato exige 6: validar el pool entero daría un
falso error de tamaño, así que `validateTeam` se llama sobre el paste completo **con
`Dex.formats.get(...)` sin la regla de tamaño** — en la práctica, validar set a set con
`validator.validateSet` y quedarse con esos errores. Elegir la vía en el paso de implementación y
dejarlo anotado en el código.

- [x] **Paso 4: verificar** — `npx tsc --noEmit`, `npx eslint server/chat-plugins/bats-ingest.ts`,
`npx mocha test/server/chat-plugins/bats-ingest.js`.

- [x] **Paso 5: commit.**

---

# Fase 4 — El teambuilder

### Task 10: Capa de datos del snapshot en el cliente

**Files:**
- Create: `bats/web/src/lib/dex/snapshot.ts`, `bats/web/src/lib/dex/learnsets.ts`,
  `bats/web/src/lib/dex/snapshot.test.ts`
- Modify: `bats/web/src/lib/showdown.ts` (paste con nivel, género, shiny y felicidad)

**Interfaces:**
- Produce: `loadDex(): Promise<Dex>` con
  `Dex = { meta, species: Record<string, Species>, moves, items, abilities, natures }`, memoizado a
  nivel de módulo y con la URL versionada (`/dex/species.json?v=<meta.generated_at>`).
- Produce: `searchSpecies(dex, query, filters): Species[]` — filtros por tipo, generación, color,
  egg group y "solo legales".
- Produce: `loadLearnset(speciesId): Promise<string[]>` — carga el bucket `learnsets/<letra>.json`
  una sola vez y lo cachea.
- Produce: `speciesById(dex, nameOrId): Species | null` (resuelve "Mr. Mime", "mrmime",
  "Urshifu-Rapid-Strike").

- [x] **Paso 1: tests** (vitest, con `fetch` mockeado sobre un snapshot mínimo): resolución por
  nombre/id/forma, búsqueda con filtros combinados, un solo `fetch` por archivo aunque se llame dos
  veces, learnset cacheado por bucket, especie inexistente → `null`.
- [x] **Paso 2: `cd web && npx vitest run src/lib/dex` → FAIL.**
- [x] **Paso 3: implementar.**
- [x] **Paso 4: `npx vitest run` → PASS (los 13 tests de `showdown.test.ts` siguen verdes).**
- [x] **Paso 5: commit.**

---

### Task 11: Motor de reglas en el cliente

**Files:**
- Create: `bats/web/src/lib/dex/validate.ts`, `bats/web/src/lib/dex/validate.test.ts`

**Interfaces:**
- Consume: `loadDex`, `loadLearnset` (Task 10); `ActiveSeason` de `lib/api.ts`.
- Produce: `checkTeam(dex, team: BuilderMon[], season, banned): { rows: ChecklistRow[], setErrors:
  Record<string, string[]> }` — `rows` con la **misma forma** que devuelve `POST /api/teams/me/validate`
  (`{ rule, label, ok, names }`), para poder pintar ambos con `ChecklistPanel`.
- Produce: `checkSet(dex, learnset, mon): string[]` — movimiento ilegal, movimiento repetido,
  EVs > 510 o > 252 en una stat, IV fuera de 0-31, habilidad que la especie no tiene, más de 4
  movimientos, objeto inexistente.

**Regla de oro:** este motor es un **espejo de `bats_core/rules.py` para dar respuesta inmediata**;
la autoridad sigue siendo el servidor. Cada regla nueva se implementa primero en `rules.py`.
`validate.test.ts` debe cubrir los mismos casos que `tests/test_rules.py` (tipo del mes, color,
generación, egg group, item clause, paradox, pseudo, restricted, UB, tamaño, baneados).

- [x] **Paso 1: tests** (un caso por regla, más uno de "equipo completo válido").
- [x] **Paso 2: FAIL. Paso 3: implementar. Paso 4: PASS. Paso 5: commit.**

---

### Task 12: Combobox y selector de especies

**Files:**
- Create: `bats/web/src/components/ui/combobox.tsx`,
  `bats/web/src/components/builder/SpeciesPicker.tsx`

**Interfaces:**
- Produce: `<Combobox items={{id,label,sublabel,icon}[]} value onChange placeholder emptyText />` —
  accesible con teclado (flechas, Enter, Esc), `role="combobox"`/`aria-expanded`, virtualizado por
  simple `slice(0, 50)`.
- Produce: `<SpeciesPicker open onOpenChange onPick={(species) => void} team hint />` dentro de un
  `ResponsiveSheet` (ya existe, `components/app/ResponsiveSheet.tsx`): buscador, filtros por tipo /
  gen / color / egg group, sprite (`PokemonSprite`), `TypeBadges`, BST, y distintivos para
  Paradox / pseudo / restricted / baneado / no legal.
- `hint` destaca lo que le falta al equipo: p. ej. "Te falta un pokémon de tipo Hielo" con un filtro
  de un toque que lo aplica.

Reutilizar sin reescribir: `components/app/PokemonSprite.tsx`, `components/app/TypeBadge.tsx`,
`components/ui/input.tsx`, `components/ui/badge.tsx`, `lib/motion.ts`.

- [x] **Pasos:** test de `Combobox` con vitest + Testing Library (filtra, selecciona con teclado,
  anuncia resultados) → FAIL → implementar → PASS → commit. `SpeciesPicker` se verifica en la
  Task 16 (revisión visual).

---

### Task 13: Editor de sets

**Files:**
- Create: `bats/web/src/components/builder/SetEditor.tsx`,
  `bats/web/src/components/builder/EVEditor.tsx`

**Interfaces:**
- Consume: `Combobox` (Task 12), `loadLearnset`/`checkSet` (Tasks 10-11).
- Produce: `<SetEditor mon={BuilderMon} dex onChange={(mon) => void} errors={string[]} />` con:
  objeto, habilidad (solo las de la especie), naturaleza (mostrando +stat/−stat), tipo Tera, cuatro
  `Combobox` de movimientos **restringidos al learnset** (con tipo, categoría y poder en la fila), y
  `EVEditor`.
- Produce: `<EVEditor evs ivs onChange />` — barras con total restante sobre 510, tope de 252 por
  stat, IVs plegados (`components/ui/collapsible.tsx`) y por defecto a 31.

Los errores se muestran junto al campo que los causa, no en un bloque al final.

- [x] **Pasos:** tests (no deja elegir un movimiento fuera del learnset; pasar de 510 EVs marca
  error; cambiar la naturaleza actualiza el resumen de stats) → FAIL → implementar → PASS → commit.

---

### Task 14: TeamBuilder y reescritura de TeamPage

**Files:**
- Create: `bats/web/src/components/builder/TeamBuilder.tsx`,
  `bats/web/src/components/builder/PasteIO.tsx`
- Modify: `bats/web/src/pages/TeamPage.tsx`, `bats/web/src/lib/api.ts`,
  `bats/web/src/lib/queries.ts`
- Delete: `bats/web/src/lib/pokeapi.ts`, `bats/web/src/lib/team-resolve.ts`,
  `bats/web/src/components/team/PasteBuilder.tsx`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: `<TeamBuilder initial={BuilderMon[]} season banned onSave />` — columna izquierda con los
  hasta 8 pokémon (sprite, tipos, objeto; arrastrables para reordenar no es necesario), columna
  derecha con el `SetEditor` del seleccionado, y `ChecklistPanel` fijo (en móvil, una barra inferior
  plegable con "N de M reglas cumplidas" que se expande).
- Produce: `<PasteIO />` — importar pegando un equipo de Showdown (reusa `parsePaste` de
  `lib/showdown.ts`, ahora resolviendo contra el snapshot y **no** contra PokéAPI) y exportar/copiar
  (`toPaste`, ya existe y ya se usa en `TeamPage`).
- Produce en `lib/api.ts`: `editSet(pokemonId, payload)` → `PATCH /api/teams/me/pokemon/{id}`; en
  `lib/queries.ts`: `useEditSet()` invalidando `["team"]` como las demás mutaciones.
- `TeamPage` muestra además el bloque `validation` del roster: "Showdown revisó tu equipo: todo bien"
  / la lista de errores / "pendiente de revisión".

Detalle que no se puede perder: `usePoolPayloads` (hoy en `TeamPage.tsx:88`) existe solo porque los
pokémon guardados no traen color/gen/egg group y había que ir a PokéAPI. Con el snapshot local se
resuelven en memoria: **borrar ese hook**.

- [x] **Pasos:** test de `PasteIO` (pegar el equipo de ejemplo de `showdown.test.ts` produce 1 mon
  resuelto con tipos correctos; una especie inventada se marca) → FAIL → implementar → `npx tsc -b`,
  `npm run lint` (0 errores), `npx vitest run` → PASS → commit.

---

### Task 15: Admin y visibilidad

**Files:**
- Modify: `bats/web/src/pages/admin/` (página de reglas y una vista de rosters),
  `bats/bats_core/api/routes/admin.py`

**Interfaces:**
- `roster_enforcement` y `max_restricted` aparecen solos en la página de reglas: `RestrictionField`
  ya se genera desde `RESTRICTION_SPEC` vía `GET /api/rules/...`. **Verificarlo**, no reimplementarlo.
- Produce: `GET /api/admin/rosters` → por jugador: nº de pokémon, estado de validación de Showdown,
  cambios usados, si tiene lineup. Página `/admin/rosters` con `DataList` (tabla en escritorio,
  tarjetas en móvil).
- La página de reglas avisa si `tournament.dex_meta.ps_commit` no coincide con el `meta.json`
  estático: "el dex de la base y el del navegador no son el mismo; vuelve a importar".

- [ ] **Pasos:** test del endpoint en `tests/test_features.py` → FAIL → implementar → PASS → commit.

---

### Task 16: Documentación y verificación de punta a punta

**Files:**
- Modify: `/Users/jazar/Documents/GitHub/CLAUDE.md`, `bats/BATS_DOCS.md`,
  `bats/MIGRACION_VERCEL_SUPABASE.md`, `bats/BATS_API.postman_collection.json`,
  `bats/bats_core/paths.py` (`BATS_ACTIVE_ROSTERS_FILE`)

- [ ] **Paso 1:** en `CLAUDE.md`, actualizar: el diagrama de arquitectura (tercer archivo
  sincronizado, `active_rosters.json`), la lista de puntos de contacto por filesystem, el apartado de
  parches a PS (ahora son **tres**: `sockets.ts`, `onBattleLogged` y `validatingUser`), los comandos
  (`node tools/export_dex.js`, `python -m bats_core dex --import`) y la sección de reglas del dominio
  (el dex es la fuente de verdad; PokéAPI ya no se usa en el teambuilder).
- [ ] **Paso 2:** endpoints nuevos en la colección de Postman.
- [ ] **Paso 3:** verificación completa (abajo).
- [ ] **Paso 4:** commit.

---

## Verificación

**Backend + reglas**
```bash
createdb bats_teambuilder_test
cd /Users/jazar/Documents/GitHub/bats && source venv/bin/activate
python -m bats_core db --apply-schema --dsn postgresql://localhost/bats_teambuilder_test
BATS_TEST_DSN=postgresql://localhost/bats_teambuilder_test pytest -v      # todo verde, ~135 tests
python -m bats_core dex --import --dsn postgresql://localhost/bats_teambuilder_test
```

**Showdown**
```bash
cd /Users/jazar/Documents/GitHub/pokemon-showdown
npx tsc --noEmit                 # solo el error preexistente de battle-teams.ts
npx eslint sim/team-validator.ts config/formats.ts server/chat-plugins/bats-ingest.ts
node build
npx mocha test/sim/team-validator.js test/server/chat-plugins/bats-ingest.js
cd ../bats && node tools/check_dex_export.js && node tools/roster_parity.js
```

**Frontend**
```bash
cd /Users/jazar/Documents/GitHub/bats/web
npx tsc -b && npm run lint && npx vitest run && npm run build
```

**End to end, en local y con datos desechables:**
1. `python -m bats_core api` contra `bats_teambuilder_test`, `npm run dev` en `web/`.
2. Crear temporada con tipo del mes "Ice", `required_color: yellow`, `item_clause: true`,
   `roster_enforcement: true`; dar de alta una cuenta y meterla en el whitelist.
3. En `/equipo`: buscar especies (sprites y tipos correctos), comprobar que el panel de reglas pasa
   de rojo a verde al añadir un pokémon de hielo y uno amarillo, que un objeto repetido lo marca al
   instante, que un movimiento fuera del learnset no se puede elegir, y que el botón de registrar
   solo se habilita con todo en verde.
4. Registrar, editar un movimiento (`PATCH`) y comprobar en `/api/teams/me` que
   `rotations_used` **no** subió.
5. Copiar el paste del equipo, arrancar PS con `Config.batsurl` apuntando a la API local (**sobre una
   copia del fork, no sobre el checkout real**: `BATS_PS_DIR` temporal), esperar a que escriba
   `active_rosters.json`, y comprobar con `node bats_core/validate_team.js` que el equipo registrado
   pasa y el mismo equipo con un movimiento cambiado es rechazado.
6. Comprobar que `GET /api/teams/me` muestra `validation.state = "ok"` tras la sincronización.
7. `dropdb bats_teambuilder_test` y borrar el sandbox de PS.

**Despliegue (orden obligatorio):** 1) `node tools/export_dex.js` y commitear el snapshot;
2) desplegar el código; 3) `python -m bats_core db --apply-schema --dsn <Supabase session>`;
4) `python -m bats_core dex --import --dsn <Supabase session>`; 5) activar `roster_enforcement`
en la temporada **solo cuando todos los equipos registrados aparezcan con `validation.state = "ok"`**
(si no, nadie podrá batallar).

## Riesgos conocidos

- **Deriva entre el snapshot y el fork.** Si alguien mergea upstream y no regenera el dex, el
  builder ofrecerá cosas que PS rechaza. Mitigación: `meta.ps_commit` visible en admin y el doble
  check del validador real (Task 6/9).
- **Tres implementaciones de la misma regla** (rules.py, validate.ts, formats.ts). Mitigación: los
  fixtures de paridad (Task 4/8) y la norma de "primero `rules.py`". No añadir una regla en TS sin
  añadirla antes en Python.
- **`roster_enforcement` activado antes de tiempo** deja a toda la liga sin poder batallar. Por eso
  es una restricción de temporada (por defecto `false`) y no un comportamiento fijo.
- **`validatingUser` es un parche a `sim/team-validator.ts`**: hay que conservarlo en cada merge con
  upstream, como el hook `onBattleLogged`. Queda anotado en `CLAUDE.md` (Task 16).
