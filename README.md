# BATS

Sistema de estadísticas y administración de la **PGL (PinchesGueys League)**, la liga de Pokémon Showdown de PinchesGueys. Recibe las batallas del server de Showdown, calcula estadísticas (MVP, kills, uso) y ofrece el sitio de la liga: stats, teambuilder, bans, blog y panel de administración.

## Estructura

```
bats_core/   backend Python: API (FastAPI), ETL, parser de logs, CLI y PGL-Bot
api/         entrypoint de Vercel (reexporta bats_core.api.main:app)
web/         frontend React + Vite (SPA)
tests/       pytest
tools/       exportador del dex de Showdown y chequeos de paridad
docs/        documentación, migración y planes (docs/planes/)
```

## Stack

- **Backend:** Python 3.12, FastAPI, psycopg2, python-jose (JWT de Supabase Auth)
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, TanStack Query, React Router
- **Datos:** PostgreSQL en Supabase
- **Despliegue:** Vercel (SPA estática + función Python)
- **Adyacente:** fork del server de Pokémon Showdown (checkout aparte, `../pokemon-showdown`)

## Desarrollo local

```bash
# Backend (desde la raíz)
python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
python -m bats_core db --apply-schema      # schema + migraciones (DB local)
python -m bats_core api                    # API en :8001

# Frontend
cd web && npm ci && npm run dev            # :5173, proxya /api a :8001
```

Variables en `.env` (nunca se commitea): `BATS_DB_DSN`, `BATS_VOTER_SALT`, `BATS_SUPABASE_URL`, etc. Detalle en [CLAUDE.md](CLAUDE.md).

## Tests y CI

```bash
ruff check bats_core tests
pytest                                  # suite completa; los tests de DB se saltan sin BATS_TEST_DSN
cd web && npm run lint && npm run build
```

El CI (GitHub Actions) corre lo esencial: `ruff`, `pytest` sobre MVP, reglas, forma canónica de sets, auth e ingesta, y `lint` + `build` del frontend. Si todo pasa, despliega a Vercel: `main` a producción, `dev` y los PR a preview. La suite completa de `pytest` y `vitest` se corre en local.

## Ramas

- `main`: producción
- `dev`: preview de integración
- ramas de feature: PR hacia `main`

## Documentación

- [docs/MIGRACION_VERCEL_SUPABASE.md](docs/MIGRACION_VERCEL_SUPABASE.md): estado de la migración a Vercel + Supabase
- [docs/BATS_DOCS.md](docs/BATS_DOCS.md): módulos, rutas de API, esquema de DB, fórmulas (parcialmente desactualizado; manda el código)
- [docs/BATS_API.postman_collection.json](docs/BATS_API.postman_collection.json): colección de Postman
- [docs/planes/](docs/planes/): planes de diseño e implementación
