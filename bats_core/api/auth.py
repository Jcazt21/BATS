"""
BATS — Autenticación.

Personas (jugadores y admin): Supabase Auth con magic link. El frontend obtiene un
JWT de Supabase y lo manda como Bearer; aquí se verifica con el JWKS público del
proyecto (asimétrico: no hay ningún secreto compartido en el servidor). La
identidad sale de `tournament.player_accounts` (email -> username, is_admin), que
da de alta el admin.

Máquinas (plugin de PS y cron de Vercel): `service_token()`, tokens estáticos.

BATS_VOTER_SALT ya NO participa en la autenticación: solo anonimiza votos
(api/crypto.py). Rotarlo invalida todos los voter_hash históricos.

Variable requerida: BATS_SUPABASE_URL (https://<ref>.supabase.co). Sin ella las
rutas protegidas responden 503 (fallan cerrado).
"""
import hmac
import json
import os
import time
import urllib.request
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .db import get_db

_bearer = HTTPBearer(auto_error=False)   # sin header -> 401 (auto_error=True daría 403)

_ALGORITHMS = ["ES256", "RS256"]
_JWKS_TTL_S = 600
_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}


def _supabase_url() -> str:
    url = os.environ.get("BATS_SUPABASE_URL", "").rstrip("/")
    if not url:
        raise HTTPException(status_code=503, detail="BATS_SUPABASE_URL no está configurado en el servidor.")
    return url


def _get_jwks(force: bool = False) -> list[dict]:
    """JWKS del proyecto, cacheado a nivel de módulo (sobrevive invocaciones calientes)."""
    now = time.time()
    if not force and _jwks_cache["keys"] is not None and now - _jwks_cache["fetched_at"] < _JWKS_TTL_S:
        return _jwks_cache["keys"]
    url = f"{_supabase_url()}/auth/v1/.well-known/jwks.json"
    try:
        with urllib.request.urlopen(url, timeout=5) as res:   # noqa: S310 (URL de configuración)
            keys = json.load(res).get("keys", [])
    except Exception:
        raise HTTPException(status_code=503, detail="No se pudo obtener la clave de verificación.")
    _jwks_cache.update(keys=keys, fetched_at=now)
    return keys


def decode_token(token: str) -> dict:
    """Verifica firma, expiración, audiencia y emisor de un JWT de Supabase."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")
    if header.get("alg") not in _ALGORITHMS:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    kid = header.get("kid")
    key = next((k for k in _get_jwks() if k.get("kid") == kid), None)
    if key is None:   # rotación de claves: un único reintento sin caché
        key = next((k for k in _get_jwks(force=True) if k.get("kid") == kid), None)
    if key is None:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    try:
        return jwt.decode(
            token, key, algorithms=_ALGORITHMS,
            audience="authenticated", issuer=f"{_supabase_url()}/auth/v1",
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")


def _bearer_token(creds: Optional[HTTPAuthorizationCredentials]) -> str:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Falta el token de autenticación.")
    return creds.credentials


def require_player(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    Dependency — sesión de jugador. Devuelve {user_id, email, username, is_admin}.

    Un JWT válido de Supabase no basta: el email debe estar dado de alta por el
    admin en player_accounts. En el primer login se enlaza user_id.
    """
    claims = decode_token(_bearer_token(creds))
    email = str(claims.get("email") or "").strip().lower()
    user_id = claims.get("sub")
    if not email or not user_id:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    with get_db() as db:
        row = db.fetchone(
            """
            SELECT account_id, user_id::text AS user_id, email, username, is_admin
            FROM tournament.player_accounts
            WHERE LOWER(email) = %s
            """,
            (email,),
        )
        if row is None:
            raise HTTPException(status_code=403, detail="Tu cuenta no está registrada en la liga.")
        if row["user_id"] is None:
            db.execute(
                "UPDATE tournament.player_accounts SET user_id = %s WHERE account_id = %s AND user_id IS NULL",
                (user_id, row["account_id"]),
            )
        elif row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Esta cuenta está vinculada a otro usuario.")

    return {
        "user_id":  user_id,
        "email":    row["email"],
        "username": row["username"],
        "is_admin": bool(row["is_admin"]),
    }


def require_admin(player: dict = Depends(require_player)) -> dict:
    """Dependency — inyectar en cualquier ruta de administración."""
    if not player["is_admin"]:
        raise HTTPException(status_code=403, detail="Se requieren permisos de administrador.")
    return player


def service_token(env_var: str):
    """
    Dependency factory para endpoints llamados por máquinas (no por personas):
    la ingesta desde PS (BATS_INGEST_TOKEN) y el cron de Vercel (CRON_SECRET).

    - Lee la variable en cada request, no al importar (serverless: el entorno
      puede cambiar entre despliegues).
    - Falla CERRADO: si la variable no está configurada responde 503 en vez de
      aceptar cualquier token.
    - Compara en tiempo constante.
    """
    def _dependency(creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> None:
        expected = os.environ.get(env_var)
        if not expected:
            raise HTTPException(status_code=503, detail=f"{env_var} no está configurado en el servidor.")
        token = _bearer_token(creds)
        if not hmac.compare_digest(token.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="Token inválido.")

    return _dependency
