#!/usr/bin/env bash
# Base desechable para los tests de Arena (I13).
#   eval "$(tools/arena_testdb.sh up)"   # crea la base, aplica el esquema y exporta BATS_TEST_DSN
#   tools/arena_testdb.sh down           # borra las bases bats_arena_test_*
# Con `createdb` en el PATH usa el Postgres local; si no, un contenedor Docker (postgres:17-alpine
# en el puerto 55432, sin contraseña, solo escucha en 127.0.0.1). Nunca toca BATS_DB_DSN.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTENEDOR=bats-arena-pg
PUERTO=${BATS_ARENA_PG_PORT:-55432}

if command -v createdb >/dev/null 2>&1 && [ -z "${BATS_ARENA_DOCKER:-}" ]; then
  MODO=local
else
  MODO=docker
fi

psql_admin() {
  if [ "$MODO" = local ]; then psql -qAt -d postgres -c "$1"
  else docker exec "$CONTENEDOR" psql -qAt -U postgres -c "$1"; fi
}

arrancar_docker() {
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTENEDOR"; then
    docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
    docker run -d --name "$CONTENEDOR" -p "127.0.0.1:$PUERTO:5432" \
      -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
  fi
  for _ in $(seq 1 60); do
    docker exec "$CONTENEDOR" pg_isready -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "Postgres no arrancó" >&2; return 1
}

case "${1:-}" in
  up)
    [ "$MODO" = docker ] && arrancar_docker
    BASE="bats_arena_test_$$"
    psql_admin "CREATE DATABASE $BASE" >&2
    if [ "$MODO" = local ]; then DSN="postgresql://localhost/$BASE"
    else DSN="postgresql://postgres@127.0.0.1:$PUERTO/$BASE"; fi
    PY=python
    [ -x venv/bin/python ] && PY=venv/bin/python
    # BATS_DB_DSN fuera del entorno: el esquema se aplica solo con el --dsn explícito.
    env -u BATS_DB_DSN "$PY" -m bats_core db --apply-schema --dsn "$DSN" >&2
    echo "export BATS_TEST_DSN='$DSN'"
    ;;
  down)
    if [ "$MODO" = docker ] && ! docker ps --format '{{.Names}}' | grep -qx "$CONTENEDOR"; then exit 0; fi
    for b in $(psql_admin "SELECT datname FROM pg_database WHERE datname LIKE 'bats\_arena\_test\_%'"); do
      psql_admin "DROP DATABASE IF EXISTS $b WITH (FORCE)" >&2
    done
    ;;
  *) echo "uso: $0 up|down" >&2; exit 2 ;;
esac
