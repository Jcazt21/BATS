# Entorno de dev: Supabase + Vercel para la rama `dev`

## Contexto

BATS ya está en producción: un solo proyecto Vercel (`bats`) sirviendo el
SPA y la API Python desde el mismo origen, con Postgres en Supabase
(proyecto `BATS`, `us-east-1`). El despliegue lo hace GitHub Actions
(`.github/workflows/ci.yml`), no el git-integration nativo de Vercel
(`vercel.json` tiene `git.deploymentEnabled: false`): en push a `main` corre
`vercel deploy --prod` tras pasar tests; en cada PR corre `vercel deploy`
(preview) y comenta el link.

Existe una rama `dev` (`origin/dev`, recién creada, igual a `main` en
`eca0522`) pero no tiene ni base de datos ni pipeline de despliegue propios.
Hoy, cualquier preview de PR pega contra la base de datos de **producción**
(`vercel env ls` confirma que `BATS_DB_DSN`, `BATS_VOTER_SALT`,
`BATS_INGEST_TOKEN` y `CRON_SECRET` están seteadas para `Production` y
`Preview` con el mismo valor). El objetivo de este documento es que la rama
`dev` tenga su propio Supabase y su propio deploy de Vercel, sin tocar cómo
funciona `main` hoy ni crear un segundo proyecto Vercel.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Aislamiento de la DB de dev | Proyecto Supabase separado (`BATS-dev`), no un schema dentro de `BATS` |
| Datos iniciales de dev | Copia de producción vía `pg_dump`/`pg_restore` (mismo mecanismo que la migración inicial) |
| Proyecto Vercel | El mismo (`bats`); no se crea un proyecto nuevo |
| Ambiente Vercel para dev | Preview, con variables **scoped a la rama `dev`** (no las Preview vars genéricas que ya usan los PRs) |
| Deploy de dev | Automático en cada push a `dev`, gateado por los mismos tests de CI que ya corren para `main`/PRs |
| PS apuntando a dev | Fuera de alcance — PS sigue apuntando a producción |

## Componentes

### 1. Supabase `BATS-dev`

- Proyecto nuevo, misma org (`aommiabadnsmoyjohtaj`) y región (`us-east-1`)
  que `BATS`, para no cruzar continentes en cada query desde la función de
  Vercel (mismo razonamiento que Fase 1 de `MIGRACION_VERCEL_SUPABASE.md`).
- Se crea con el CLI de Supabase (ya autenticado en esta máquina:
  `supabase projects list` lo confirma).
- Schema: `python -m bats_core db --apply-schema --dsn <dsn-sesión-dev>`.
  Es idempotente, igual que contra `BATS`.
- Datos: `pg_dump` de `BATS` (DSN de sesión, `:5432`) y `pg_restore` contra
  `BATS-dev`. Snapshot puntual, no hay sync automático — si se necesitan
  datos más recientes, se repite a mano.
- Nuevas variables en `bats/.env` (no se commitean, siguiendo la
  convención existente): `BATS_DEV_SUPABASE_DSN_POOLER` (`:6543`, para
  Vercel) y `BATS_DEV_SUPABASE_DSN_SESSION` (`:5432`, para migraciones y
  `pg_dump`/`pg_restore`). Nunca son el DSN por defecto de `bats_core`;
  se pasan con `--dsn` explícito a los comandos de `cli.py`, igual que ya
  se hace con Supabase de producción.

### 2. Variables de entorno en Vercel

- Se agregan `BATS_DB_DSN`, `BATS_VOTER_SALT`, `BATS_INGEST_TOKEN`,
  `CRON_SECRET` (y `BATS_SUPABASE_URL`/`VITE_SUPABASE_URL`/
  `VITE_SUPABASE_ANON_KEY` si en ese momento ya aplica Fase 4) como
  variables de **Preview scoped a la rama `dev`** — en el dashboard de
  Vercel (o `vercel env add <NAME> preview` eligiendo "Preview Branches:
  dev"). Esto es distinto de las Preview vars genéricas que ya existen: un
  PR contra `main` sigue viendo las de producción tal como hoy: **no se
  toca ese comportamiento existente**, aunque siga siendo cuestionable a
  futuro.
- `BATS_VOTER_SALT` de dev es un valor nuevo, no el de producción (es
  también el secreto de firma de JWT — no debe compartirse entre entornos).
- `bats/vercel.json` gana:
  ```json
  "git": { "deploymentEnabled": { "main": false, "dev": true } }
  ```
  Esto no dispara el deploy (lo sigue haciendo GitHub Actions); solo evita
  que el git-integration nativo de Vercel intente desplegar por su cuenta
  cuando detecte push a `dev` con `deploymentEnabled` global en `false`.

### 3. CI/CD (`.github/workflows/ci.yml`)

- El trigger `push.branches` gana `dev` junto a `main`.
- El job `deploy` (que ya depende de `backend-tests`, `backend-lint`,
  `frontend-checks`) gana una rama condicional para
  `github.ref == 'refs/heads/dev'`:
  1. `vercel pull --yes --environment=preview --git-branch=dev
     --token=...` — el flag `--git-branch` trae las variables scoped del
     paso 2, no las Preview genéricas.
  2. `vercel build --token=...` (sin `--prod`).
  3. `vercel deploy --prebuilt --token=...` (sin `--prod`).
  4. La URL resultante se escribe en el job summary
     (`$GITHUB_STEP_SUMMARY`) — no hay PR al que comentarle.
- Los pasos existentes para `push` a `main` y para `pull_request` no
  cambian.

### 4. Flujo de trabajo local

- Nada nuevo que aprender: para operar a mano contra el Supabase de dev
  (aplicar una migración, correr `backfill`, importar el dex) se usan los
  mismos subcomandos de `python -m bats_core ...` con
  `--dsn "$BATS_DEV_SUPABASE_DSN_SESSION"` (o `_POOLER` según corresponda),
  igual que ya se documenta para producción en `CLAUDE.md`.
- El frontend en dev local (`npm run dev` en `web/`) sigue proxyando a
  `localhost:8001`; para apuntarlo contra el Supabase de dev basta correr
  `python -m bats_core api` localmente con `BATS_DB_DSN` seteada al DSN de
  dev en el entorno del proceso (no en `bats/.env`, para no pisar el
  default).

## Fuera de alcance

- Pokémon Showdown apuntando al Supabase/Vercel de dev (PS sigue contra
  producción).
- Sync automático/periódico de datos prod → dev.
- Un segundo proyecto Vercel.
- Resolver que los previews de PR contra `main` hoy pegan a la DB de
  producción (preexistente, no se toca en este trabajo).

## Verificación

1. `BATS-dev` existe, mismo catálogo (estructura) que `BATS` tras
   `--apply-schema` — comparación de firma de schema, igual que se hizo al
   migrar `BATS`.
2. Conteos de filas de `BATS-dev` iguales a `BATS` tras el
   `pg_dump`/`pg_restore`.
3. `python -m bats_core db --apply-schema --dsn <dev>` reaplicado no
   rompe nada (idempotencia).
4. Push a `dev` → CI corre los 3 jobs de test → job `deploy` corre la
   rama de dev → aparece una URL de preview en el summary.
5. Esa URL responde `/api/stats/...` con datos que existen en
   `BATS-dev` y no cambian si se modifica algo en `BATS` (prueba de
   aislamiento).
6. Los previews de PRs contra `main` siguen viendo la DB de producción,
   sin cambios de comportamiento.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Supabase Free pausa el proyecto a los 7 días sin actividad | Igual que `BATS` hoy; ya asumido, no se resuelve aquí |
| Datos de dev quedan desactualizados vs. producción | Snapshot puntual documentado; repetir el dump a mano cuando haga falta |
| `BATS_DEV_SUPABASE_DSN_*` termina commiteado por error | Sigue viviendo solo en `bats/.env` (gitignored) y en Vercel; nunca hardcodeado |
| Alguien setea las vars de dev como Preview genéricas en vez de scoped a `dev` | Verificación #5 (aislamiento) lo detecta antes de dar el trabajo por terminado |
