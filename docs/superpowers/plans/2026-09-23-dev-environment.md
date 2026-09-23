# Entorno de dev (Supabase + Vercel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a la rama `dev` su propia base de datos Supabase y su propio deploy automático de Vercel (preview scoped a esa rama), sin crear un segundo proyecto Vercel ni tocar el comportamiento de producción.

**Architecture:** Proyecto Supabase nuevo (`BATS-dev`, misma org y región que `BATS`) con el schema aplicado y datos copiados de producción vía `pg_dump`/`pg_restore`. Mismo proyecto Vercel `bats`, con variables de entorno Preview scoped a la rama `dev` (DSN, salt, tokens propios, no compartidos con producción). GitHub Actions (`.github/workflows/ci.yml`) gana un trigger de `push` a `dev` que, tras pasar los mismos tests que ya corren, hace `vercel pull --git-branch=dev` + build + deploy (sin `--prod`).

**Tech Stack:** Supabase CLI, `psql`/`pg_dump`/`pg_restore`, Vercel CLI, GitHub Actions, `python -m bats_core` (backend propio).

**Spec:** [docs/superpowers/specs/2026-09-23-dev-environment-design.md](../specs/2026-09-23-dev-environment-design.md)

## Global Constraints

- Org de Supabase: `aommiabadnsmoyjohtaj` (slug de la org "BATS"). Región: `us-east-1` (misma que el proyecto `BATS` de producción y las funciones de Vercel).
- Ningún secreto de dev se commitea. Viven en `bats/.env` (gitignored) y como variables de Vercel.
- Los secretos de dev (`BATS_VOTER_SALT`, `BATS_INGEST_TOKEN`, `CRON_SECRET`) son valores **nuevos**, nunca los mismos que producción.
- `--apply-schema` y los subcomandos de `bats_core` que tocan Supabase siempre reciben `--dsn` explícito — nunca dependen del DSN por defecto.
- Proyecto Vercel existente: `bats` (`prj_xTXxAHwyyjr0HjWp7sO1RjMrmdca`, org `team_l4Y7eUX0pHkNBSnfz0pNY4Fq`). No se crea un proyecto nuevo.
- El deploy real lo sigue haciendo GitHub Actions (`vercel deploy` desde CI), no el git-integration nativo de Vercel.

---

### Task 1: Crear el proyecto Supabase `BATS-dev` y guardar sus DSNs

**Files:**
- Modify: `bats/.env` (agrega `BATS_DEV_SUPABASE_DSN_POOLER`, `BATS_DEV_SUPABASE_DSN_SESSION`)

**Interfaces:**
- Consumes: `supabase` CLI ya autenticado (`supabase orgs list` funciona), org id `aommiabadnsmoyjohtaj`.
- Produces: `$BATS_DEV_SUPABASE_DSN_POOLER` y `$BATS_DEV_SUPABASE_DSN_SESSION` en `bats/.env`, usados por las Tasks 2, 3 y 4.

- [ ] **Step 1: Confirmar que `bats/.env` está en `.gitignore`**

Run: `cd /Users/jazar/Documents/GitHub/bats && git check-ignore -v .env`
Expected: imprime una línea (el patrón de `.gitignore` que lo cubre). Si no imprime nada, PARAR — no seguir sin confirmar que `.env` no se commitea.

- [ ] **Step 2: Generar una contraseña para la DB de dev**

Run: `openssl rand -hex 24 > /tmp/bats_dev_db_pass.txt && cat /tmp/bats_dev_db_pass.txt`
Guarda el valor impreso; se usa en el siguiente paso.

- [ ] **Step 3: Crear el proyecto Supabase**

Run (reemplaza `<PASSWORD>` por el valor del paso 2):
```bash
supabase projects create BATS-dev \
  --org-id aommiabadnsmoyjohtaj \
  --region us-east-1 \
  --db-password '<PASSWORD>' \
  --output json > /tmp/bats_dev_project.json
cat /tmp/bats_dev_project.json
```
Expected: JSON con `"id"` (el ref del proyecto, ej. `abcdefghijklmnop`) y `"region": "us-east-1"`.

- [ ] **Step 4: Esperar a que el proyecto quede activo**

Run:
```bash
REF=$(python3 -c "import json;print(json.load(open('/tmp/bats_dev_project.json'))['id'])")
echo "ref=$REF"
until supabase projects list --output json | python3 -c "
import json,sys
projs=json.load(sys.stdin)
p=[p for p in projs if p['ref']=='$REF']
sys.exit(0 if p and p[0]['status']=='ACTIVE_HEALTHY' else 1)
"; do echo "esperando..."; sleep 10; done
echo "proyecto activo"
```
Expected: eventualmente imprime `proyecto activo` (puede tardar 1-3 minutos).

- [ ] **Step 5: Construir los DSNs y agregarlos a `bats/.env`**

Run (usa el mismo `$REF` del paso 4 y la contraseña del paso 2):
```bash
PASS=$(cat /tmp/bats_dev_db_pass.txt)
{
  echo ""
  echo "# Supabase de dev (proyecto BATS-dev, org aommiabadnsmoyjohtaj, us-east-1)"
  echo "BATS_DEV_SUPABASE_DSN_POOLER=postgresql://postgres.${REF}:${PASS}@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  echo "BATS_DEV_SUPABASE_DSN_SESSION=postgresql://postgres.${REF}:${PASS}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
} >> /Users/jazar/Documents/GitHub/bats/.env
```

- [ ] **Step 6: Verificar que el DSN de sesión conecta**

Run:
```bash
source /Users/jazar/Documents/GitHub/bats/.env
psql "$BATS_DEV_SUPABASE_DSN_SESSION" -c "select 1;"
```
Expected: una fila con `1`. Si falla con error de conexión, esperar 30s más (el proyecto puede seguir provisionando) y reintentar.

- [ ] **Step 7: Limpiar el archivo temporal con la contraseña**

Run: `rm -f /tmp/bats_dev_db_pass.txt /tmp/bats_dev_project.json`

No hay commit en esta tarea — `bats/.env` no se commitea (Step 1 lo confirmó).

---

### Task 2: Aplicar el schema al Supabase de dev

**Files:**
- None (solo ejecuta contra la DB remota)

**Interfaces:**
- Consumes: `$BATS_DEV_SUPABASE_DSN_SESSION` (Task 1), `bats_core/db/schema.sql` + `migrations/v*.sql` existentes.
- Produces: schema `battle.*`/`tournament.*` completo en `BATS-dev`, listo para Task 3.

- [ ] **Step 1: Activar el venv del backend**

Run: `cd /Users/jazar/Documents/GitHub/bats && source venv/bin/activate`
Expected: el prompt muestra `(venv)`.

- [ ] **Step 2: Aplicar el schema**

Run:
```bash
source .env
python -m bats_core db --apply-schema --dsn "$BATS_DEV_SUPABASE_DSN_SESSION"
```
Expected: termina sin error (el mismo comando que ya se corrió contra `BATS` de producción; es idempotente).

- [ ] **Step 3: Comparar el catálogo contra producción**

Run:
```bash
COUNT_DEV=$(psql "$BATS_DEV_SUPABASE_DSN_SESSION" -tAc "
  select count(*) from information_schema.tables
  where table_schema in ('battle','tournament');
")
COUNT_PROD=$(psql "$BATS_SUPABASE_DSN_SESSION" -tAc "
  select count(*) from information_schema.tables
  where table_schema in ('battle','tournament');
")
echo "dev=$COUNT_DEV prod=$COUNT_PROD"
test "$COUNT_DEV" = "$COUNT_PROD" && echo "OK: mismo número de tablas"
```
Expected: `OK: mismo número de tablas`.

- [ ] **Step 4: Reaplicar el schema para confirmar idempotencia**

Run: `python -m bats_core db --apply-schema --dsn "$BATS_DEV_SUPABASE_DSN_SESSION"`
Expected: termina sin error otra vez (segunda corrida, mismo resultado).

No hay commit en esta tarea (no se toca el repo).

---

### Task 3: Copiar los datos de producción a dev

**Files:**
- None (dump/restore entre dos DBs remotas)

**Interfaces:**
- Consumes: `$BATS_SUPABASE_DSN_SESSION` (producción, ya existe en `.env`), `$BATS_DEV_SUPABASE_DSN_SESSION` (Task 1), schema ya aplicado (Task 2).
- Produces: `BATS-dev` con los mismos datos que `BATS` al momento del dump.

- [ ] **Step 1: Dump de datos de producción (solo datos, sin schema)**

Run:
```bash
source /Users/jazar/Documents/GitHub/bats/.env
pg_dump "$BATS_SUPABASE_DSN_SESSION" \
  --data-only --disable-triggers \
  --schema=battle --schema=tournament \
  -Fc -f /tmp/bats_prod_data.dump
ls -lh /tmp/bats_prod_data.dump
```
Expected: el archivo existe y pesa más de 0 bytes.

- [ ] **Step 2: Restaurar en dev**

Run:
```bash
pg_restore --data-only --disable-triggers \
  -d "$BATS_DEV_SUPABASE_DSN_SESSION" \
  /tmp/bats_prod_data.dump
```
Expected: termina sin errores fatales (pueden aparecer warnings de `ALTER TABLE ... DISABLE TRIGGER` en objetos que no existen si algún trigger no aplica — no son fatales; los errores fatales sí deben investigarse antes de seguir).

- [ ] **Step 3: Comparar conteos de filas en las tablas clave**

Run:
```bash
for t in battle.fact_battles battle.fact_pokemon_performance tournament.seasons tournament.player_accounts; do
  d=$(psql "$BATS_DEV_SUPABASE_DSN_SESSION" -tAc "select count(*) from $t;" 2>/dev/null || echo "ERR")
  p=$(psql "$BATS_SUPABASE_DSN_SESSION" -tAc "select count(*) from $t;" 2>/dev/null || echo "ERR")
  echo "$t: dev=$d prod=$p"
done
```
Expected: `dev` y `prod` iguales en cada línea (`tournament.player_accounts` puede estar vacía en ambas si la Fase 4 no se desplegó — igual deben coincidir entre sí).

- [ ] **Step 4: Limpiar el dump local**

Run: `rm -f /tmp/bats_prod_data.dump`

No hay commit en esta tarea.

---

### Task 4: Variables de entorno de Vercel scoped a la rama `dev`

**Files:**
- None (solo el dashboard/CLI de Vercel)

**Interfaces:**
- Consumes: `$BATS_DEV_SUPABASE_DSN_POOLER` (Task 1), proyecto Vercel `bats` ya linkeado (`.vercel/project.json` existente).
- Produces: `BATS_DB_DSN`, `BATS_VOTER_SALT`, `BATS_INGEST_TOKEN`, `CRON_SECRET` en Vercel como Preview scoped a `dev`, consumidas por Task 6/7 vía `vercel pull --git-branch=dev`.

- [ ] **Step 1: Generar secretos nuevos para dev (no reutilizar los de prod)**

Run:
```bash
DEV_VOTER_SALT=$(openssl rand -hex 32)
DEV_INGEST_TOKEN=$(openssl rand -hex 32)
DEV_CRON_SECRET=$(openssl rand -hex 32)
echo "$DEV_VOTER_SALT" > /tmp/bats_dev_voter_salt.txt
echo "$DEV_INGEST_TOKEN" > /tmp/bats_dev_ingest_token.txt
echo "$DEV_CRON_SECRET" > /tmp/bats_dev_cron_secret.txt
```

- [ ] **Step 2: Agregar `BATS_DB_DSN` scoped a `dev`**

Run:
```bash
cd /Users/jazar/Documents/GitHub/bats
source .env
vercel env add BATS_DB_DSN preview --git-branch dev --value "$BATS_DEV_SUPABASE_DSN_POOLER" --sensitive --yes
```
Expected: confirma que la variable fue creada para `Preview` + branch `dev`.

- [ ] **Step 3: Agregar `BATS_VOTER_SALT`, `BATS_INGEST_TOKEN`, `CRON_SECRET` scoped a `dev`**

Run:
```bash
vercel env add BATS_VOTER_SALT preview --git-branch dev --value "$(cat /tmp/bats_dev_voter_salt.txt)" --sensitive --yes
vercel env add BATS_INGEST_TOKEN preview --git-branch dev --value "$(cat /tmp/bats_dev_ingest_token.txt)" --sensitive --yes
vercel env add CRON_SECRET preview --git-branch dev --value "$(cat /tmp/bats_dev_cron_secret.txt)" --sensitive --yes
```
Expected: las tres confirmaciones de creación.

- [ ] **Step 4: Verificar que quedaron scoped correctamente**

Run: `vercel env ls`
Expected: aparecen 4 filas nuevas para `BATS_DB_DSN`, `BATS_VOTER_SALT`, `BATS_INGEST_TOKEN`, `CRON_SECRET` con `environments` mostrando `Preview` (la vista de texto no siempre imprime el branch; confirmar con `vercel env ls preview dev` si existe esa variante, o revisar en el dashboard de Vercel → Settings → Environment Variables → filtro por branch `dev`).

- [ ] **Step 5: Limpiar los archivos temporales de secretos**

Run: `rm -f /tmp/bats_dev_voter_salt.txt /tmp/bats_dev_ingest_token.txt /tmp/bats_dev_cron_secret.txt`

No hay commit en esta tarea.

---

### Task 5: `vercel.json` — habilitar deploy nativo solo para `dev`

**Files:**
- Modify: `bats/vercel.json`

**Interfaces:**
- Consumes: nada.
- Produces: `git.deploymentEnabled` como objeto, usado (indirectamente, evitando doble-deploy) por Task 6.

- [ ] **Step 1: Editar `vercel.json`**

Cambiar:
```json
  "git": {
    "deploymentEnabled": false
  },
```
por:
```json
  "git": {
    "deploymentEnabled": {
      "main": false,
      "dev": true
    }
  },
```

- [ ] **Step 2: Validar que el JSON sigue siendo válido**

Run: `cd /Users/jazar/Documents/GitHub/bats && python3 -m json.tool vercel.json > /dev/null && echo "JSON válido"`
Expected: `JSON válido`.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "$(cat <<'EOF'
chore: habilitar git-integration de Vercel solo para dev

deploymentEnabled pasa de false a {main:false, dev:true} — el deploy
real lo sigue haciendo GitHub Actions; esto evita que Vercel dispare
un deploy nativo duplicado cuando detecte push a dev.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: CI — deploy automático a preview en push a `dev`

**Files:**
- Modify: `.github/workflows/ci.yml:1-7` (trigger), `.github/workflows/ci.yml:84-143` (job `deploy`)

**Interfaces:**
- Consumes: Task 4 (variables scoped a `dev` en Vercel), Task 5 (`vercel.json` actualizado).
- Produces: job `deploy` con una rama para `push` a `dev`, corre tras `backend-tests`, `backend-lint`, `frontend-checks`.

- [ ] **Step 1: Agregar `dev` al trigger de `push`**

En `.github/workflows/ci.yml`, cambiar:
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```
por:
```yaml
on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]
```

- [ ] **Step 2: Acotar los pasos de producción a la rama `main`**

Cambiar los 3 `if: github.event_name == 'push'` de los pasos "Vercel pull (production)", "Vercel build (production)" y "Vercel deploy (production)" por:
```yaml
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```
(las tres ocurrencias, una por paso).

- [ ] **Step 3: Agregar los pasos de deploy para `dev`**

Después del paso "Vercel deploy (production)" y antes de "Vercel pull (preview)", insertar:
```yaml
      - name: Vercel pull (dev)
        if: github.event_name == 'push' && github.ref == 'refs/heads/dev'
        run: vercel pull --yes --environment=preview --git-branch=dev --token=${{ secrets.VERCEL_TOKEN }}

      - name: Vercel build (dev)
        if: github.event_name == 'push' && github.ref == 'refs/heads/dev'
        run: vercel build --token=${{ secrets.VERCEL_TOKEN }}

      - name: Vercel deploy (dev)
        if: github.event_name == 'push' && github.ref == 'refs/heads/dev'
        id: deploy_dev
        run: |
          url=$(vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }})
          echo "url=$url" >> "$GITHUB_OUTPUT"

      - name: Resumen del deploy de dev
        if: github.event_name == 'push' && github.ref == 'refs/heads/dev'
        run: echo "🚀 Preview de dev desplegado: ${{ steps.deploy_dev.outputs.url }}" >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 4: Validar el YAML**

Run:
```bash
cd /Users/jazar/Documents/GitHub/bats
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML válido')"
```
Expected: `YAML válido`.

- [ ] **Step 5: Revisar el diff completo**

Run: `git diff .github/workflows/ci.yml`
Expected: solo los cambios descritos arriba — el trigger, los 3 `if` acotados a `main`, y los 4 pasos nuevos de `dev`. Los pasos de `pull_request` (preview de PRs) quedan intactos.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
feat(ci): deploy automático a preview en push a dev

Push a dev corre los mismos tests que main/PRs y, si pasan, hace
vercel pull --git-branch=dev (trae las env vars scoped del proyecto
BATS-dev) + build + deploy sin --prod. Los pasos de producción quedan
acotados a refs/heads/main para no duplicarse en push a dev.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Sincronizar `dev` con `main` y verificar el deploy end-to-end

**Files:**
- None (operaciones de git + verificación remota)

**Interfaces:**
- Consumes: commits de Task 5 y Task 6 en `main`; `origin/dev` existente (creada por el usuario, igual a `main` antes de estos cambios).
- Produces: `dev` actualizada con `vercel.json`/`ci.yml` nuevos; confirmación de que el pipeline completo funciona y que los datos están aislados de producción.

- [ ] **Step 1: Traer las ramas remotas**

Run: `cd /Users/jazar/Documents/GitHub/bats && git fetch origin --prune`
Expected: sin errores (si aparece el error de certificado SSL visto antes, reintentar una vez — fue transitorio).

- [ ] **Step 2: Actualizar `main` local y empujar los commits de las Tasks 5 y 6**

Run:
```bash
git push origin main
```
Expected: push exitoso (fast-forward, ya que `main` local solo tiene los 2 commits nuevos encima de lo que ya está en `origin/main`).

- [ ] **Step 3: Traer `dev` a una rama local y mergear `main`**

Run:
```bash
git checkout -b dev origin/dev
git merge origin/main
```
Expected: merge limpio (fast-forward o trivial, ya que `dev` y `main` partían del mismo commit y `main` solo avanzó con los 2 commits de infraestructura).

- [ ] **Step 4: Empujar `dev`**

Run: `git push origin dev`
Expected: push exitoso; esto dispara el workflow de CI en GitHub (trigger `push.branches: [main, dev]` de la Task 6).

- [ ] **Step 5: Verificar la corrida de CI**

Run: `gh run list --branch dev --limit 1`
Expected: una corrida `in_progress` o `completed`/`success` para el push reciente a `dev`.

Run (esperar a que termine si sigue corriendo):
```bash
gh run watch $(gh run list --branch dev --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: termina con éxito (los 3 jobs de test + `deploy`).

- [ ] **Step 6: Obtener la URL del preview de dev**

Run: `gh run view $(gh run list --branch dev --limit 1 --json databaseId -q '.[0].databaseId') --log | grep "Preview de dev desplegado"`
Expected: una línea con la URL del deploy (`https://bats-git-dev-...vercel.app` o similar).

- [ ] **Step 7: Confirmar que ese preview usa la DB de dev, no la de producción**

Run (reemplaza `<URL>` por la del paso anterior):
```bash
curl -s "<URL>/api/stats/formats" | head -c 500
```
Compara contra:
```bash
source .env
psql "$BATS_DEV_SUPABASE_DSN_SESSION" -tAc "select format from tournament.seasons limit 5;"
```
Expected: los formatos que devuelve el endpoint del preview corresponden a los datos de `BATS-dev` (que son una copia puntual de prod, así que hoy coincidirán en contenido — la prueba real de aislamiento es la Step 8).

- [ ] **Step 8: Probar el aislamiento — insertar una fila solo en dev y confirmar que no aparece en prod**

Run:
```bash
source .env
psql "$BATS_DEV_SUPABASE_DSN_SESSION" -c "
  insert into tournament.seasons (name, is_active)
  values ('__test-aislamiento-dev__', false)
  on conflict do nothing;
"
psql "$BATS_SUPABASE_DSN_SESSION" -tAc "
  select count(*) from tournament.seasons where name = '__test-aislamiento-dev__';
"
```
Expected: `0` (la fila insertada en dev no existe en producción).

- [ ] **Step 9: Limpiar la fila de prueba**

Run:
```bash
psql "$BATS_DEV_SUPABASE_DSN_SESSION" -c "
  delete from tournament.seasons where name = '__test-aislamiento-dev__';
"
```

No hay commit en esta tarea (solo verificación).
