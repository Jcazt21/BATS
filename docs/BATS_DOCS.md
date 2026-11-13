# BATS — Battle Analyzing and Tracking System
> Documentación técnica completa · v1.0 · Destinada a developers y agentes de programación

> ⚠️ **Documento parcialmente desactualizado por la migración a Vercel + Supabase.** Cambios que aún no están reflejados abajo:
> el paquete es `bats_core/` (ejecutar desde la raíz de este repo con `python -m bats_core ...`); la ingesta es **por push** desde PS
> (`POST /api/ingest/battle`) y el watcher de filesystem quedó deprecado; el ETL Cleaner ya no lista/borra archivos
> (solo DB: `/run`, `/files`); `requirements.txt` ahora es solo lo de la API y `requirements-dev.txt` lo de desarrollo;
> Docker/nginx se eliminaron; la DB se crea con `--apply-schema` (schema + migraciones v2–v8). Ver
> [MIGRACION_VERCEL_SUPABASE.md](MIGRACION_VERCEL_SUPABASE.md) (sección "Estado de la ejecución"). Si algo choca con el código, manda el código.

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Estructura de Directorios](#3-estructura-de-directorios)
4. [Setup y Configuración](#4-setup-y-configuración)
5. [Módulos del Core](#5-módulos-del-core)
6. [API REST (FastAPI)](#6-api-rest-fastapi)
7. [Bot de Pokémon Showdown](#7-bot-de-pokémon-showdown)
8. [Base de Datos PostgreSQL](#8-base-de-datos-postgresql)
9. [CLI — Interfaz de Línea de Comandos](#9-cli--interfaz-de-línea-de-comandos)
10. [Flujos de Datos Claves](#10-flujos-de-datos-claves)
11. [Variables de Entorno](#11-variables-de-entorno)
12. [Convenciones y Patrones](#12-convenciones-y-patrones)

---

## 1. Visión General

BATS es un sistema backend Python que integra con un servidor local de **Pokémon Showdown (Gen 9)** para:

- **Parsear** logs de batalla (`.log.json`) generados por PS
- **Calcular métricas BI**: MVP Score, Pick Rate, Win Rate, detección de outliers
- **Persistir** resultados en PostgreSQL
- **Exponer** una API REST (FastAPI) consumida por la web app (`bats/web/`)
- **Gestionar** temporadas del torneo, votaciones anónimas de ban y bans oficiales
- **Ejecutar** un bot de PS (`PGL-Bot`) que entrena a los jugadores

### Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | Python 3.12+ |
| API | FastAPI + Uvicorn |
| DB | PostgreSQL 15+ |
| Driver DB | psycopg2-binary |
| Bot PS | poke-env |
| BI | pandas |
| Config | python-dotenv |
| Auth | JWT (HS256, python-jose) |
| File Watcher | watchdog |
| Reporting | rich (opcional) |

---

## 2. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────┐
│                   Pokémon Showdown Server                │
│           Genera logs/YYYY-MM/format/date/id.log.json    │
└──────────────────────┬──────────────────────────────────┘
                       │ .log.json files
              ┌────────▼────────┐
              │  BATSWatcher    │  (watchdog — filesystem observer)
              │  watcher.py     │  Detects new .log.json → fires ETL
              └────────┬────────┘
                       │ triggers
              ┌────────▼────────┐
              │  ETL Pipeline   │  db/etl.py
              │  parse → load   │  Idempotente, por batalla
              └────────┬────────┘
                       │ writes
              ┌────────▼────────┐
              │  PostgreSQL DB  │
              │  battle schema  │  Hechos de batallas
              │  tournament     │  Temporadas, bans, votos
              └────────┬────────┘
                       │ reads
     ┌─────────────────▼──────────────────┐
     │         FastAPI (bats/api/)         │
     │  /api/stats  /api/ban  /api/admin  │
     └─────────────────┬──────────────────┘
                       │ HTTP JSON
              ┌────────▼────────┐
              │   bats-web      │  React + shadcn/ui
              │  (React SPA)    │
              └─────────────────┘

     ┌─────────────────────────────────────┐
     │          PGL-Bot (bats/bot/)         │
     │  Lee active_bans.json               │
     │  Genera equipos válidos             │
     │  Acepta desafíos en PS              │
     └─────────────────────────────────────┘
```

### Separación de esquemas DB (regla crítica)

```
battle.*     → Datos efímeros de batallas. Puede truncarse sin perder torneo data.
tournament.* → Temporadas, bans, votos. NUNCA truncar en cascada.
```

> **IMPORTANTE:** `tournament` no tiene foreign keys apuntando a `battle`. Los metadatos de pokémon del torneo viven en `tournament.pokemon_cache`, **independiente** de `battle.dim_pokemon`.

---

## 3. Estructura de Directorios

```
bats/
├── __init__.py             # Version: 1.0.0, descripción del paquete
├── __main__.py             # python -m bats_core → delega a cli.py
├── cli.py                  # Entry point CLI (argparse). Subcomandos: db, ban, bot, watch, clean, reset
├── parser.py               # Parsea archivos .log.json → BattleData
├── metrics.py              # Cálculos BI: MVP, Pick Rate, Win Rate, outliers
├── report.py               # Render de reportes en consola (rich) y guarda CSV
├── bans.py                 # Lógica de negocio de bans (registro, revocación, listado)
├── pokeapi.py              # Cliente HTTP de PokéAPI v2 con cache en disco
├── watcher.py              # File system watcher → dispara ETL automáticamente
├── active_bans.json        # Cache JSON de bans activos (leído por el bot)
├── requirements.txt        # Dependencias Python
├── Dockerfile              # Para despliegue containerizado de la API
│
├── api/                    # FastAPI application
│   ├── main.py             # App factory, routers, CORS, watcher thread
│   ├── auth.py             # JWT HS256 (require_admin dependency)
│   ├── crypto.py           # hash_username: SHA-256(SALT + username)
│   ├── db.py               # get_db() context manager para rutas
│   └── routes/
│       ├── admin.py        # /api/admin/* (login, whitelist, battles, reset)
│       ├── ban.py          # /api/ban/* (check-user, submit, ranking, status)
│       ├── etl_cleaner.py  # /api/etl/* (limpieza de datos)
│       ├── leaguesettings.py # /api/league/* (config de liga)
│       ├── seasons.py      # /api/admin/seasons/* (CRUD temporadas + bans oficiales)
│       ├── stats.py        # /api/stats/* (mvp, pickrate, leaderboard, bot battles)
│       └── teams.py        # /api/teams/* (registro y gestión de equipos)
│
├── bot/                    # PGL-Bot
│   ├── __init__.py
│   ├── bot.py              # Entry point del bot (run_bot + RotatingTeambuilder)
│   ├── config.py           # Constantes: TYPE_OF_MONTH, SERVER_HOST, BATTLE_FORMAT, BANS_FILE
│   ├── feedback.py         # Post-batalla: análisis enviado al jugador (PM en PS)
│   ├── player.py           # PGLPlayer — lógica de decisión de movimientos del bot
│   ├── sets.py             # Pools de equipos: RESTRICTED, PSEUDO, ICE_OU, GEN5, etc.
│   └── team_builder.py     # build_team_paste(), build_team_pool() — arma equipos válidos
│
└── db/
    ├── __init__.py
    ├── connection.py       # BATSDatabase — context manager + execute/fetchall/fetchone
    ├── etl.py              # BATSEtl + run_etl() — pipeline completo de carga
    ├── schema.sql          # DDL completo: tablas, índices, vistas, funciones, seed
    └── migrations/
        ├── v2.sql          # Migración v2
        ├── v3.sql          # Migración v3
        ├── v4.sql
        ├── v5.sql
        ├── v6.sql
        └── v7.sql          # Migración v7 (más reciente)
```

---

## 4. Setup y Configuración

### Prerrequisitos

- Python 3.12+
- PostgreSQL 15+ corriendo en `localhost:5432`
- DB creada: `CREATE DATABASE "bats-pkmn";`

### Instalación

```bash
# BATS es un repo hermano de pokemon-showdown/:
#   GitHub/bats/ (backend en bats_core/ + frontend en web/)  ·  GitHub/pokemon-showdown/
# Los comandos `python3 -m bats_core ...` se corren desde la raíz de este repo (GitHub/bats/).
cd bats
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt     # requirements.txt = solo lo que instala Vercel
```

### Archivo `.env` (en `bats/.env`)

Rutas opcionales para ubicar el server de PS (defaults entre paréntesis): `BATS_PS_DIR` (`../pokemon-showdown`), `BATS_LOGS_DIR` (`<PS_DIR>/logs`), `BATS_ACTIVE_BANS_FILE` (`<PS_DIR>/active_bans.json`). Ver `bats_core/paths.py`.

```env
BATS_DB_DSN=postgresql://postgres:password@localhost:5432/bats-pkmn
BATS_VOTER_SALT=un-salt-secreto-minimo-32-chars
BATS_API_HOST=0.0.0.0
BATS_API_PORT=8011
```

### Inicializar la base de datos

```bash
# Crea/actualiza schema.sql + migraciones v2–v8 y puebla las vistas (idempotente)
python3 -m bats_core db --apply-schema

# Cargar los logs que ya existen en PS: por la API (necesita BATS_API_URL y BATS_INGEST_TOKEN)...
python3 -m bats_core backfill
# ...o directo a la DB
python3 -m bats_core db --etl
```

### Arrancar la API

```bash
python3 -m bats_core api
# → Uvicorn en http://0.0.0.0:8011
# → BATSWatcher se inicia como hilo daemon (escucha ../logs/)
```

### Arrancar el bot

```bash
python3 -m bats_core bot
# Opciones:
python3 -m bats_core bot --username PGL-Bot --host localhost --port 8000
```

### Modo watcher standalone

```bash
python3 -m bats_core watch --logs-dir ../pokemon-showdown/logs
```

---

## 5. Módulos del Core

### `parser.py` — Log Parser

Parsea archivos `.log.json` de Pokémon Showdown y extrae métricas por Pokémon.

**Estructuras de datos:**

```python
@dataclass
class PokemonStats:
    species: str
    player: str
    kills: int          # KOs otorgados a pokémon rivales
    turns_active: int   # Turnos que estuvo en el campo
    survived: bool      # True si no se desmayó al final
    final_hit: bool     # True si hizo el KO al último pokémon rival

@dataclass
class BattleData:
    battle_id: str
    format: str
    date: str           # YYYY-MM-DD (inferido del path del archivo)
    p1: str
    p2: str
    winner: str
    turns: int
    end_type: str       # "normal" | "forfeit"
    p1_team: list[str]  # Nombres de especie del equipo
    p2_team: list[str]
    pokemon_stats: list[PokemonStats]
```

**Función principal:**

```python
from bats_core.parser import parse_battle_file
from pathlib import Path

battle = parse_battle_file(Path("logs/2026-03/gen9pinchesgueys/2026-03-15/abc123.log.json"))
# → BattleData | None
# Retorna None si: JSON corrupto, faltan campos, < 3 turnos (batalla de prueba)
```

**Regex que usa:**

| Regex | Evento PS |
|---|---|
| `RE_SWITCH` | `\|switch\|p1a: Garchomp\|...` |
| `RE_MOVE` | `\|move\|p1a: Garchomp\|Earthquake\|p2a: Ferrothorn` |
| `RE_FAINT` | `\|faint\|p1a: Garchomp` |
| `RE_TURN` | `\|turn\|5` |
| `RE_WIN` | `\|win\|PlayerName` |

**Lógica de KO:**
El parser rastrea el "último atacante" por Pokémon objetivo. Al producirse un `faint`, el último atacante recibe `kills += 1`. El atacante del último faint recibe `final_hit = True`.

**Pokémon de banca (sin eventos):**
Los Pokémon que no aparecen en el log (nunca salieron al campo) se agregan con stats en 0, pero sí cuentan para el pick rate del equipo.

---

### `metrics.py` — Motor de Métricas BI

**Fórmula MVP (oficial BATS):**

```
Pts_MVP = (Kills × 2) + Supervivencia + Final_Hit

Donde:
  Kills        = KOs otorgados en la batalla
  Supervivencia = 1 si no se desmayó, 0 si no
  Final_Hit    = 1 si dio el KO final, 0 si no
```

> ⚠️ **Diferencia entre `metrics.py` y `db/etl.py`:** El ETL usa una fórmula ligeramente diferente: `(kills × 2) + turns_active + final_hit`. El `metrics.py` es para el modo análisis en memoria (legacy).

**Funciones públicas:**

```python
from bats_core.metrics import (
    build_raw_dataframe,     # battles → pd.DataFrame base
    compute_torneo_report,   # agrega por (jugador, pokémon)
    compute_pick_rate,       # global por especie
    compute_mvp_leaderboard, # ranking MVP
    detect_outliers,         # pokémon con Pick Rate > threshold
)

# DataFrame base: una fila por (batalla, jugador, pokémon)
# Columnas: battle_id, format, date, Player_User, Pokemon_Used,
#           won_battle, kills_in_battle, turns_survived, survived, final_hit, mvp_score_battle
df_raw = build_raw_dataframe(battles)

# Pick rate: Usage% = (batallas_pickeado / total_batallas) × 100
pick_rate_df = compute_pick_rate(df_raw, total_battles=len(battles))

# Outliers: candidatos a baneo con usage > threshold (default 70%)
outliers = detect_outliers(pick_rate_df, threshold=70.0)
```

---

### `pokeapi.py` — Cliente PokéAPI

Cliente HTTP sin dependencias externas (usa solo `urllib.request`). Tiene cache persistente en disco.

```python
from bats_core.pokeapi import PokeAPIClient, PokeAPIError

client = PokeAPIClient()  # cache en bats/.pokeapi_cache/

# Retorna dict con display_name, types, sprite_url, base_stats, exists
info = client.get_species_info("Garchomp")
# → {
#     "display_name": "Garchomp",
#     "types": "Dragon / Ground",
#     "sprite_url": "https://raw.githubusercontent.com/PokeAPI/...",
#     "base_stats": {"hp": 108, "attack": 130, ...},
#     "exists": True
#   }

info = client.get_species_info("asdfasdf")
# → None (pokémon no existe)
```

**Cache:** Cada pokémon consultado se guarda como `bats/.pokeapi_cache/<slug>.json`. En consultas posteriores se sirve desde disco sin tocar la red. Cache corrupto se detecta y elimina automáticamente.

**Normalización de nombres:**
- `"Garchomp"` → `"garchomp"`
- `"Iron Moth"` → `"iron-moth"`
- `"Flutter Mane"` → `"flutter-mane"`

---

### `bans.py` — Lógica de Negocio de Bans

Gestiona el ciclo de vida de los **bans oficiales** (confirmados por el admin) del torneo.

**Reglas:**
- Cada jugador puede tener **máximo 1 ban activo** por temporada
- El Pokémon se valida contra la PokéAPI antes de banearse
- Un ban puede revocarse (soft delete: `is_active = FALSE`)

```python
from bats_core.db.connection import BATSDatabase
from bats_core.bans import register_ban, revoke_ban, list_bans

with BATSDatabase() as db:
    # Registrar ban
    result = register_ban(db, "campixx21", "Garchomp")
    # → {"player": "campixx21", "pokemon": "Garchomp", "types": "Dragon / Ground", ...}

    # Revocar ban
    result = revoke_ban(db, "campixx21")

    # Listar bans activos (desde tournament.v_active_bans)
    bans = list_bans(db)
    # → [{"banned_by_player": ..., "pokemon": ..., "types": ..., ...}]
```

---

### `watcher.py` — File System Watcher

Usa `watchdog` para escuchar la carpeta de logs y disparar el ETL automáticamente.

```python
from pathlib import Path
from bats_core.watcher import BATSWatcher

# Non-blocking
w = BATSWatcher(logs_dir=Path("logs/"))
w.start()   # inicia en background thread
# ...
w.stop()

# Blocking hasta Ctrl+C
w.run()
```

**Comportamiento:**
- Al iniciar, hace un scan inicial de archivos sin procesar
- Al detectar un nuevo `.log.json`, ejecuta el ETL en un hilo separado
- Si el ETL ya está corriendo cuando llega otro evento, lo encola (pendiente)
- Usa un `threading.Lock` para garantizar que no corra en paralelo consigo mismo

---

### `db/connection.py` — BATSDatabase

Context manager que gestiona el ciclo de vida de la conexión a PostgreSQL.

```python
from bats_core.db.connection import BATSDatabase

# Uso recomendado (context manager)
with BATSDatabase() as db:
    # Auto commit al salir sin excepción, rollback si hay excepción
    db.execute("INSERT INTO ...", (param1, param2))
    rows = db.fetchall("SELECT * FROM ...", (param1,))
    row  = db.fetchone("SELECT * FROM ... LIMIT 1", (param1,))
```

**Métodos:**

| Método | Descripción |
|---|---|
| `execute(sql, params)` | INSERT, UPDATE, DELETE, DDL. Hace commit automático. |
| `fetchall(sql, params)` | SELECT → `list[dict]`. Usa RealDictCursor. |
| `fetchone(sql, params)` | SELECT → `dict \| None`. |
| `apply_schema(path)` | Lee y ejecuta un archivo `.sql` completo. |
| `begin() / commit() / rollback()` | Control manual de transacciones. |

**Precedencia de DSN:**
1. Parámetro `dsn` explícito
2. Variable de entorno `BATS_DB_DSN`
3. Fallback: `postgresql://localhost/bats-pkmn`

---

### `db/etl.py` — Pipeline ETL

Carga `BattleData` en PostgreSQL. Completamente idempotente.

```python
from pathlib import Path
from bats_core.db.connection import BATSDatabase
from bats_core.db.etl import run_etl

with BATSDatabase() as db:
    stats = run_etl(
        logs_dir=Path("logs/"),
        db=db,
        verbose=True,   # logging DEBUG
        fmt=None,       # None = todos los formatos
    )
    # stats → {"loaded": 5, "skipped": 3, "errors": 0, "total": 8, "error_details": [...]}
```

**Flujo de `BATSEtl.load_battle(battle, file_path)`:**

```
1. Verificar battle.etl_log → si status="ok", skip
2. Resolver dimensiones (get_or_create): players, formats, pokemon
3. Resolver season_id por fecha de batalla
4. Detectar si es batalla vs bot (is_bot → skip y registrar como 'skipped')
5. INSERT battle.fact_battles
6. INSERT battle.fact_pokemon_performance (pokémon activos)
7. INSERT fact_pokemon_performance (pokémon de banca, was_active=FALSE)
8. Detectar violaciones de ban (_detect_ban_violations)
9. Detectar violaciones de equipo (_detect_team_violations)
10. Registrar en battle.etl_log con status="ok"
11. COMMIT
```

**Fórmula MVP en el ETL:**
```
mvp_score = (kills × 2) + turns_active + (1 if final_hit else 0)
```

**Garantías de idempotencia:**
- Todos los `INSERT` usan `ON CONFLICT DO NOTHING` o `DO UPDATE`
- Cada batalla es su propia transacción; un fallo no afecta las demás
- `battle.etl_log` actúa como tabla de control

**Al finalizar el ETL** (si se cargaron batallas): llama a `battle.refresh_bats_views()` que refresca todas las vistas materializadas.

---

## 6. API REST (FastAPI)

### Iniciar

```bash
python3 -m bats_core api
# Disponible en: http://localhost:8011
# Docs interactivos: http://localhost:8011/docs
```

### Autenticación Admin

Las rutas admin requieren un JWT Bearer token:

```bash
# Login
curl -X POST http://localhost:8011/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "tu-BATS_VOTER_SALT"}'
# → {"access_token": "eyJ...", "token_type": "bearer"}

# Usar en rutas protegidas
curl http://localhost:8011/api/admin/bans \
  -H "Authorization: Bearer eyJ..."
```

El secret del JWT se deriva de: `SHA-256(BATS_VOTER_SALT)`. Expira en 24h.

---

### Rutas Públicas

#### `GET /health`
```json
{"status": "ok", "service": "BATS API"}
```

---

### `/api/stats/*` — Estadísticas

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/stats/seasons` | Lista pública de temporadas |
| `GET` | `/api/stats/summary` | KPIs globales (total batallas, jugadores, avg turnos, top win rate). Acepta `?season_id=X` |
| `GET` | `/api/stats/mvp` | Top 5 pokémon por MVP Score acumulado. Acepta `?season_id=X` |
| `GET` | `/api/stats/pickrate` | Pick rate y win rate de las 20 especies más usadas. Acepta `?season_id=X` |
| `GET` | `/api/stats/leaderboard` | Leaderboard de jugadores con W/L. Acepta `?season_id=X` |
| `GET` | `/api/stats/bot/summary` | Rendimiento de jugadores vs bot |
| `GET` | `/api/stats/bot/pokemon` | Pokémon más usados contra el bot |
| `GET` | `/api/stats/bot/battles` | Historial de batallas vs bot (últimas 50) |
| `GET` | `/api/stats/battles/{battle_id}` | Detalle de pokémon de una batalla |
| `GET` | `/api/stats/pokemon` | Uso por especie: pick %, bring %, win rate, kills y MVP medios. Acepta `?season_id=X` |
| `GET` | `/api/stats/pokemon/{species}` | Ficha de una especie: quién la usa y sus sets más comunes (solo de rosters públicos). Acepta `?season_id=X` |
| `GET` | `/api/stats/bot/battles/{battle_id}` | Detalle de una batalla vs bot |

**Optimización:** sin `?season_id`, usa vistas materializadas (`mv_pick_rate`, `mv_player_stats`, etc.) para máxima velocidad. Con filtro de temporada hace queries a las tablas base.

---

### `/api/ban/*` — Sistema de Votación (Público + Anónimo)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/ban/check-user` | Verifica si el username puede votar (en whitelist y no ha votado) |
| `POST` | `/api/ban/submit` | Registra el voto de ban anónimo |
| `GET` | `/api/ban/ranking` | Ranking de pokémon más votados |
| `GET` | `/api/ban/status` | Progreso de la votación (voted/total) |

**Privacidad:**
- El voto se registra en `tournament.ban_votes` SIN ninguna referencia al votante
- Solo se registra en `tournament.ban_participation` que el hash votó (no qué votó)
- El username se hashea con `SHA-256(SALT + username.lower())` antes de cualquier operación

**Cuerpo de `POST /api/ban/submit`:**
```json
{
  "username": "campixx21",
  "pokemon_name": "Garchomp",
  "pokemon_types": "Dragon / Ground",
  "sprite_url": "https://...",
  "national_dex": 445
}
```

**Al registrar un voto** se llama `_export_active_bans_json()` que actualiza `bats/active_bans.json` automáticamente.

---

### `/api/admin/*` — Panel de Administración (JWT requerido)

**⚠️ `POST /api/admin/login` ya no existe** (Fase 4: magic link de Supabase Auth,
ver "Seguridad" en `CLAUDE.md`). La sesión sale del Bearer JWT de Supabase; la
API resuelve identidad y rol en `tournament.player_accounts`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/players` | Cuentas de jugador: email, username, rol, `user_id` e `is_linked` (si ya se enlazó a un login de Supabase) |
| `POST` | `/api/admin/players` | Da de alta una cuenta; acepta `user_id` opcional para crearla ya enlazada a un login |
| `PATCH` | `/api/admin/players/{id}` | Edita email/username/rol. Cambiar `username` mueve en cascada su roster/bans/whitelist de cada temporada donde tenga datos (nunca toca `battle.*`). Cambiar `email` desenlaza el login salvo que se mande `link_user_id` a la vez. `clear_user_id: true` desenlaza |
| `DELETE` | `/api/admin/players/{id}` | Elimina una cuenta (no la propia, no el último admin) |
| `GET` | `/api/admin/auth-logins` | Logins de Supabase Auth y si ya tienen cuenta (`available: false` en Postgres local, donde ese esquema no existe) |
| `GET` | `/api/admin/whitelist` | Lista whitelist de la temporada activa |
| `POST` | `/api/admin/whitelist/add` | Agrega jugador al whitelist |
| `DELETE` | `/api/admin/whitelist/{hash}` | Elimina jugador (solo si no ha votado) |
| `GET` | `/api/admin/bans` | Temporada activa + lista de pokémon votados + progreso |
| `GET` | `/api/admin/battles` | Lista todas las batallas humanas |
| `DELETE` | `/api/admin/battles/{id}` | Elimina una batalla y refresca vistas |
| `POST` | `/api/admin/reset-battles` | Elimina toda la data de batallas |
| `GET` | `/api/admin/rosters` | Equipos de la temporada activa: nº de pokémon, cambios usados, lineup fijado y veredicto de Showdown |

---

### `/api/admin/seasons/*` — Temporadas (JWT requerido)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/seasons` | Lista todas las temporadas con total_votes y total_bans |
| `POST` | `/api/admin/seasons` | Crea nueva temporada |
| `PATCH` | `/api/admin/seasons/{id}` | Edita nombre, tipo, fechas, is_active |
| `PATCH` | `/api/admin/seasons/{id}/activate` | Activa temporada (desactiva todas las demás) |
| `PATCH` | `/api/admin/seasons/{id}/close` | Cierra temporada (end_date + is_active=False) |
| `DELETE` | `/api/admin/seasons/{id}` | Elimina temporada (solo si está vacía) |
| `GET` | `/api/admin/seasons/{id}/bans` | Bans oficiales de la temporada |
| `POST` | `/api/admin/seasons/{id}/bans` | Registra ban oficial |
| `DELETE` | `/api/admin/seasons/{id}/bans/{ban_id}` | Revoca ban oficial |
| `GET` | `/api/admin/seasons/{id}/violations` | Violaciones de ban detectadas por el ETL |
| `GET` | `/api/admin/seasons/{id}/votes` | Ranking de votos anónimos |
| `GET` | `/api/admin/seasons/{id}/whitelist` | Whitelist de la temporada |
| `POST` | `/api/admin/seasons/{id}/whitelist` | Agrega jugador al whitelist |
| `DELETE` | `/api/admin/seasons/{id}/whitelist/{hash}` | Elimina jugador del whitelist |

---

### `/api/players/{username}/pokedex` — Pokédex por cuenta (pública)

`GET /api/players/{username}/pokedex` devuelve las especies que el jugador vio salir al campo en batallas de liga, de la más reciente a la más antigua. El username no distingue mayúsculas.

```json
{ "username": "ana",
  "seen": [ { "species_id": "scizormega", "species": "Scizor-Mega",
              "first_seen_at": "2026-11-10T00:00:00+00:00", "battle_id": "gen9pinchesgueysleague-1008", "opponent": "bea" } ] }
```

- `200` con `seen: []` si el jugador tiene cuenta pero aún no vio nada; `404` si no tiene cuenta ni avistamientos.
- El backend solo guarda hechos (`tournament.pokedex_seen`). La agrupación por número nacional, las preevoluciones descubiertas, los filtros y el progreso los calcula el frontend con el dex estático (`web/src/lib/dex/collection.ts`).

Reglas de la Pokédex por cuenta:

- Cuenta solo lo que **salió al campo** (`was_active`), propio o del rival. La banca no cuenta.
- Solo batallas de **liga** (`LEAGUE_FORMAT`, `bats_core/league.py`); ni sparring ni batallas contra el bot.
- Una casilla por número nacional: ver una forma (Scizor-Mega, Raichu-Alola) descubre la casilla de su número.
- Ver una especie descubre también su cadena de preevoluciones, solo hacia atrás (ver Charizard descubre a Charmeleon y Charmander). Las megas heredan la cadena de su especie base.
- El buscador encuentra por nombre solo a los descubiertos; por número, a cualquiera. La ficha `/pokedex/:species` de una casilla no descubierta redirige a la grilla.

### `/api/teams/*` — Equipos de Torneo (teambuilder)

**⚠️ Sección reescrita** (la versión anterior describía rutas por `{username}` en la URL; la
identidad sale siempre de la sesión, nunca de la URL ni del body — ver "Seguridad" en
`CLAUDE.md`). Detalle completo del diseño en
[PLAN_TEAMBUILDER.md](planes/PLAN_TEAMBUILDER.md).

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/teams/active-season` | — | Config pública de la temporada activa |
| `GET` | `/api/teams/me` | jugador | Mi roster: pool, rotaciones, y `validation` (veredicto del `TeamValidator` real de Showdown) |
| `POST` | `/api/teams/me` | jugador | Registra el equipo inicial (sets completos: objeto, habilidad, naturaleza, tera, movimientos, EVs, IVs) |
| `POST` | `/api/teams/me/validate` | jugador | Checklist en vivo contra las reglas de la temporada (lo pinta el teambuilder) |
| `PATCH` | `/api/teams/me/pokemon/{id}` | jugador | Edita el set de un pokémon ya registrado, **sin** consumir cambios. No permite cambiar de especie (usa `/me/swap`) |
| `POST` | `/api/teams/me/pokemon` | jugador | Agrega pokémon al pool (mientras haya espacio) |
| `DELETE` | `/api/teams/me/pokemon/{id}` | jugador | Quita un pokémon del pool |
| `POST` | `/api/teams/me/swap` | jugador | Reemplaza un pokémon por otro; atómico (todo o nada) |
| `GET` | `/api/teams/me/banned` | jugador | Pokémon baneados que afectan a mi equipo |
| `GET` | `/api/teams/me/history` | jugador | Historial de rotaciones (lo escribe el ETL al detectar cambios de lineup) |
| `GET` | `/api/teams/rosters` | token de ingesta | Sets canónicos + paste por jugador, para que `config/formats.ts` exija el equipo registrado en batalla (`roster_enforcement`) |

**Los metadatos de cada especie (color/generación/egg groups/tags/BST) NO salen del body del
cliente**: la API los resuelve contra `tournament.dex_species` (`bats_core/dex.py`), un espejo
del dex de Showdown exportado por `bats/tools/export_dex.js`. Lo que declare el cliente para
esos campos se ignora.

### `/api/dex/*` y `/api/ingest/roster-validation`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/dex/meta` | — | Metadatos del snapshot del dex importado en la base (`ps_commit`, fecha, nº de especies) |
| `POST` | `/api/ingest/roster-validation` | token de ingesta | Guarda el veredicto del `TeamValidator` real de Showdown para cada roster (lo llama el plugin `bats-ingest` tras sincronizar `/api/teams/rosters`) |

### `/api/me` y `/api/trainers/*` — Sprite de entrenador del carnet

El jugador elige un sprite de entrenador de Showdown que se ve en su carnet (Home), en su perfil y en el menú de cuenta.
Se guarda en `tournament.player_accounts.avatar` (migración `v13.sql`; `NULL` = iniciales). El catálogo curado vive en
`bats_core/trainers.py` (fuente única: la API valida contra él y el frontend lo lee de `GET /api/trainers`).

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/me` | sesión | `{username, email, is_admin, avatar}` |
| `PATCH` | `/api/me` | sesión | `{"avatar": id \| null}`; 422 si el id no está en el catálogo. La cuenta sale de la sesión, nunca del body |
| `GET` | `/api/trainers` | — | Catálogo `[{id, label, category}]` |
| `GET` | `/api/trainers/{id}` | — | PNG del sprite (proxy a `play.pokemonshowdown.com/sprites/trainers/{id}.png`, solo ids del catálogo) |

`GET /api/players/{username}` también devuelve `avatar`.

### `/api/admin/rosters`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/rosters` | admin | Equipos de la temporada activa: nº de pokémon, cambios usados, si fijó lineup y el veredicto de Showdown |

---

## 7. Bot de Pokémon Showdown

El `PGL-Bot` es un jugador automático que acepta desafíos para que los jugadores del torneo puedan practicar.

### Configuración (`bot/config.py`)

```python
TYPE_OF_MONTH = "Ice"          # Tipo obligatorio del mes (cambiar mensualmente)
SERVER_HOST   = "localhost"
SERVER_PORT   = 8000
BOT_USERNAME  = "PGL-Bot"
BOT_PASSWORD  = None           # Sin contraseña en servidor local
BATTLE_FORMAT = "gen9pinchesgueysleague"
MAX_RESTRICTED = 1
TEAM_SIZE      = 6
BANS_FILE = Path(__file__).parent.parent / "active_bans.json"
```

### Flujo de inicio

```
python3 -m bats_core bot
  → bot.py: build_team_pool(n=4)  # genera 4 equipos válidos
  → bot.py: RotatingTeambuilder   # rota aleatoriamente entre ellos
  → bot.py: PGLPlayer.accept_challenges()  # espera desafíos indefinidamente
  → Cada batalla: reconstruye equipos (respeta bans actualizados)
  → Post-batalla: feedback.py envía PM al jugador con análisis
```

### `team_builder.py` — Constructor de Equipos

Lee `active_bans.json` y construye equipos que respetan:

- **R4-R9**: Reglas del formato (legendario, pseudo-legendario, restricciones)
- **C1**: Al menos 1 Pokémon de `TYPE_OF_MONTH` (Ice actualmente)
- **C2**: Al menos 1 Pokémon Gen 5 (dex #494–649)
- **C3**: Al menos 1 Pokémon Egg Group Dragón
- **C4**: Al menos 1 Pokémon color Amarillo
- **Item Clause**: Sin ítems duplicados

```python
from bats_core.bot.team_builder import build_team_paste, build_team_pool

# Un equipo en formato Showdown paste
paste = build_team_paste()

# Pool de N equipos distintos
teams = build_team_pool(n=4)
```

### `active_bans.json` — Puente DB → Bot

```
DB (tournament.bans) ──[export]──> active_bans.json ──[_load_bans()]──> team_builder.py
```

Este archivo es la única interfaz entre el sistema de bans y el bot. El bot no tiene acceso a la DB.

**Se actualiza de dos maneras:**
1. Automáticamente al registrar un voto (`POST /api/ban/submit`)
2. Manualmente con `python3 -m bats_core ban --export-json`

---

## 8. Base de Datos PostgreSQL

### Esquema `battle` — Datos de Batallas

```sql
battle.dim_players          -- Jugadores (is_bot para identificar al PGL-Bot)
battle.dim_formats          -- Formatos de batalla
battle.dim_pokemon          -- Especies de Pokémon
battle.fact_battles         -- Una fila por batalla
battle.fact_pokemon_performance  -- Una fila por (batalla, jugador, pokémon)
battle.fact_ban_violations  -- Detección automática de uso de pokémon baneados
battle.etl_log              -- Control de idempotencia del ETL
```

### Esquema `tournament` — Torneo (Permanente)

```sql
tournament.seasons          -- Temporadas del torneo (is_active, type_of_month)
tournament.pokemon_cache    -- Metadatos de pokémon (aislado de battle.dim_pokemon)
tournament.ban_whitelist    -- Jugadores autorizados a votar (voter_hash + username)
tournament.ban_participation -- Registro de que un hash votó (SIN qué votó)
tournament.ban_votes        -- Votos anónimos de ban (SIN referencia al votante)
tournament.bans             -- Bans oficiales confirmados por el admin
tournament.roster           -- Equipo registrado por jugador por temporada
tournament.roster_pokemon   -- Pokémon en el pool del equipo (max 8)
tournament.roster_lineup    -- Los 6 activos del equipo en la batalla actual
tournament.pokedex_seen     -- Pokédex por cuenta: primer avistamiento de cada especie por jugador (v14)
```

### Vistas

```sql
-- Vistas simples (tiempo real)
tournament.v_active_bans     -- Bans activos con info de pokémon y temporada
tournament.v_ban_ranking     -- Ranking de votos por temporada

-- Vistas Materializadas (refrescadas solo después del ETL)
battle.mv_pick_rate           -- Pick rate y win rate por especie y formato
battle.mv_mvp_leaderboard     -- Ranking MVP por (jugador, pokémon, formato)
battle.mv_player_stats        -- W/L/winrate por jugador
battle.mv_ban_candidates      -- Especies con win_rate > 70% (candidatos a ban)
battle.mv_bot_summary         -- Rendimiento de jugadores vs bot
battle.mv_bot_pokemon         -- Pokémon usados por jugadores vs bot
```

### Funciones SQL

```sql
battle.refresh_bats_views()        -- Refresca todas las MVs en un solo CALL
battle.scan_ban_violations(season_id) -- Escanea retroactivamente violaciones de ban
battle.backfill_seasons()          -- Asigna season_id a batallas sin temporada
battle.clean_bot_battles()         -- Elimina todas las batallas vs bot
tournament.can_vote(voter_hash, season_id) -- TRUE si puede votar
tournament.upsert_pokemon_cache(name, dex, types, sprite) -- Upsert de pokemon
```

### Roles de DB

```sql
bats_app   -- API: SELECT, INSERT, UPDATE en ambos schemas, DELETE limitado
bats_etl   -- ETL: Full acceso a battle, SELECT en tournament
```

### Migraciones

Las migraciones son archivos SQL incrementales en `db/migrations/`. Se aplican **manualmente** — no hay runner automático.

```bash
# Ejemplo de aplicar una migración
psql -d bats-pkmn -f bats/db/migrations/v7.sql
```

---

## 9. CLI — Interfaz de Línea de Comandos

Invocación: `python3 -m bats_core [subcomando] [flags]`

### Modo análisis en memoria (legacy)

```bash
python3 -m bats_core --logs-dir ../pokemon-showdown/logs
python3 -m bats_core --logs-dir ../pokemon-showdown/logs --format gen9pinchesgueysleague --output reporte.csv
python3 -m bats_core --logs-dir ../pokemon-showdown/logs --ban-threshold 60 --verbose
```

No requiere PostgreSQL. Genera CSV y muestra tablas en terminal.

### Subcomando `db`

```bash
python3 -m bats_core db --apply-schema               # Aplica schema.sql (idempotente)
python3 -m bats_core db --etl --logs-dir ../pokemon-showdown/logs     # Corre ETL completo
python3 -m bats_core db --refresh-views              # Refresca MVs
python3 -m bats_core db --apply-schema --etl --logs-dir ../pokemon-showdown/logs  # Combinado
python3 -m bats_core db --dsn postgresql://... --etl --logs-dir ../pokemon-showdown/logs  # DSN explícito
```

### Subcomando `ban`

```bash
python3 -m bats_core ban --list                                          # Lista bans activos
python3 -m bats_core ban --register --player "campixx21" --pokemon "Garchomp"  # Registra ban
python3 -m bats_core ban --revoke --player "campixx21"                   # Revoca ban
python3 -m bats_core ban --export-json                                   # Exporta → active_bans.json
```

### Subcomando `bot`

```bash
python3 -m bats_core bot
python3 -m bats_core bot --username PGL-Bot --host localhost --port 8000
```

### Subcomando `watch`

```bash
python3 -m bats_core watch --logs-dir ../pokemon-showdown/logs   # Demonio: ETL automático al detectar archivos nuevos
```

### Subcomando `clean`

```bash
python3 -m bats_core clean --format gen9pinchesgueysleague   # Elimina batallas de un formato
python3 -m bats_core clean --format gen9ou --yes              # Sin confirmación
```

### Subcomando `reset`

```bash
python3 -m bats_core reset                      # Reset total (requiere escribir "RESET")
python3 -m bats_core reset --yes               # Sin confirmación interactiva
python3 -m bats_core reset --logs-dir ../pokemon-showdown/logs   # También marca logs existentes como "ya procesados"
```

### Subcomando `api`

```bash
python3 -m bats_core api   # Arranca FastAPI + BATSWatcher en background
```

---

## 10. Flujos de Datos Claves

### Flujo 1: Nueva batalla registrada

```
Jugador desafía al bot en PS
    → Batalla se juega
    → PS crea logs/2026-04/gen9pgl/2026-04-14/battle-id.log.json
    → BATSWatcher detecta el archivo (inotify/kqueue)
    → _run_etl() en hilo separado
    → parse_battle_file() → BattleData
    → BATSEtl.load_battle() en transacción
        → resolver dims (dim_players, dim_formats, dim_pokemon)
        → detectar is_bot_battle (si PGL-Bot participa → skip stats)
        → INSERT fact_battles
        → INSERT fact_pokemon_performance (activos + banca)
        → _record_pokedex_seen (solo liga, sin bot: tournament.pokedex_seen)
        → _detect_ban_violations (si hay season_id)
        → etl_log status="ok"
        → COMMIT
    → battle.refresh_bats_views()
```

### Flujo 2: Jugador registra su ban

```
Frontend (bats-web)
    → GET /api/ban/check-user {"username": "campixx21"}
    → hash_username("campixx21") = SHA-256(SALT + "campixx21")
    → verificar en ban_whitelist y ban_participation
    → {"can_vote": true}

    → (usuario selecciona pokémon en la UI)

    → POST /api/ban/submit {"username": ..., "pokemon_name": "Garchomp", ...}
    → hash_username → tournament.can_vote() = TRUE
    → upsert_pokemon_cache("Garchomp", ...)
    → INSERT ban_votes (season_id, pokemon_id)  ← SIN voter_hash
    → INSERT ban_participation (voter_hash, season_id)  ← solo que votó
    → _export_active_bans_json() → escribe active_bans.json
```

### Flujo 3: Admin confirma ban oficial

```
Admin panel (bats-web)
    → POST /api/admin/login {"password": "salt"}
    → → JWT HS256

    → GET /api/ban/ranking → ve los pokémon más votados
    → POST /api/admin/seasons/{id}/bans {"player_username": "campixx21", "pokemon_name": "Garchomp"}
        → verifica pokemon en tournament.pokemon_cache
        → verifica que el jugador no tenga ban activo ya
        → INSERT tournament.bans (season_id, player_username, pokemon_id)
```

### Flujo 4: Bot construye equipo

```
python3 -m bats_core bot
    → build_team_pool(n=4)
        → _load_bans() → lee active_bans.json → set["garchomp", ...]
        → build_team_paste() ×4:
            → _pick(RESTRICTED_POOL, banned) → 1 legendario
            → _pick(PSEUDO_POOL, banned) → 1 pseudo-legendario
            → cubrir condiciones C1-C4 con pools de backup
            → completar con OU_POOL hasta 6
    → RotatingTeambuilder(teams)
    → PGLPlayer.accept_challenges()
    → Por cada batalla: reconstruye equipos (respeta bans recientes)
```

---

## 11. Variables de Entorno

| Variable | Descripción | Default |
|---|---|---|
| `BATS_DB_DSN` | PostgreSQL connection string completo | `postgresql://localhost/bats-pkmn` |
| `BATS_VOTER_SALT` | Salt para hashing de usernames y secret JWT | `bats-default-salt-changeme` |
| `BATS_API_HOST` | Host en que escucha la API | `0.0.0.0` |
| `BATS_API_PORT` | Puerto de la API | `8011` |

> ⚠️ **Seguridad:** `BATS_VOTER_SALT` es el único secreto del sistema. Es simultáneamente el salt del hash de usernames Y la contraseña del admin. Asignar un valor largo y aleatorio en producción.

---

## 12. Convenciones y Patrones

### Patrón get_or_create en el ETL

Todos los `INSERT` en dimensiones usan `ON CONFLICT ... RETURNING id` + fallback SELECT:

```python
row = db.fetchone("INSERT INTO ... ON CONFLICT DO NOTHING RETURNING id", params)
if row is None:
    row = db.fetchone("SELECT id FROM ... WHERE ...", params)
```

Esto garantiza idempotencia sin race conditions.

### Imports lazy

Los módulos de DB (`psycopg2`, `BATSDatabase`, `run_etl`) y del bot (`poke-env`) se importan **dentro de las funciones** de CLI, no en el nivel de módulo. Esto permite que el CLI funcione sin esas dependencias instaladas cuando se usan modos que no las necesitan.

### Separación de esquemas (regla de arquitectura)

```
tournament.* → NUNCA referenciar desde battle.* con FKs
battle.*     → Puede referenciar tournament.seasons via season_id con ON DELETE SET NULL
```

Esta separación permite truncar todas las batallas (`DELETE FROM battle.fact_battles CASCADE`) sin perder ningún dato del torneo (temporadas, bans, votos).

### Privacidad del sistema de votos

El voter_hash nunca se almacena en `ban_votes`. La tabla de participación (`ban_participation`) solo registra "el hash X votó en la temporada Y", no qué votó. Es imposible reconstruir qué votó quién a partir de la DB.

### Nomenclatura de archivos de log

PS genera logs con la estructura:
```
logs/<YYYY-MM>/<format>/<YYYY-MM-DD>/<battle-id>.log.json
```

El parser infiere `date` y `format` desde el path (partes [-2] y [-3] respectivamente).

### Fórmula MVP — dos versiones

| Contexto | Fórmula |
|---|---|
| `metrics.py` (análisis en memoria) | `(kills × 2) + survived + final_hit` |
| `db/etl.py` (persistido en DB) | `(kills × 2) + turns_active + final_hit` |

La diferencia está en el segundo término: el ETL usa `turns_active` (int) mientras que el análisis en memoria usa `survived` (0 o 1 como binario). El valor en DB es el oficial.

### Vistas Materializadas vs Queries en vivo

Las rutas de stats usan MVs cuando `season_id=None` (fast path), y queries en vivo cuando se filtra por temporada. El patrón en `stats.py` es:

```python
if season_id is None:
    # fast path: materialized view
    rows = db.fetchall("SELECT ... FROM battle.mv_pick_rate ...")
else:
    # season-filtered: query base tables
    rows = db.fetchall("WITH ... SELECT ... WHERE fb.season_id = %s", (season_id, season_id))
```
