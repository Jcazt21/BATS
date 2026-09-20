"""
BATS — JWT para el panel admin.

- Firma:   HS256
- Payload: { "sub": "admin", "exp": <24h> }
- Secret:  SHA-256(BATS_VOTER_SALT)  — derivado del .env, sin dep extra
"""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

_SALT      = os.environ.get("BATS_VOTER_SALT", "bats-default-salt-changeme")
_SECRET    = hashlib.sha256(_SALT.encode()).hexdigest()   # 64-char hex string
_ALGORITHM = "HS256"
_EXPIRE_H  = 24

_bearer = HTTPBearer()


def verify_password(password: str) -> bool:
    """Compara en tiempo constante para evitar timing attacks."""
    return hmac.compare_digest(password, _SALT)


def create_token() -> str:
    payload = {
        "sub": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=_EXPIRE_H),
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")


def require_admin(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """Dependency — inyectar en cualquier ruta protegida."""
    return decode_token(creds.credentials)


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
    def _dependency(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> None:
        expected = os.environ.get(env_var)
        if not expected:
            raise HTTPException(status_code=503, detail=f"{env_var} no está configurado en el servidor.")
        if not hmac.compare_digest(creds.credentials.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="Token inválido.")

    return _dependency
