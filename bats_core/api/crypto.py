"""
BATS — Hashing de usernames para anonimizar votantes.
Lee BATS_VOTER_SALT del .env en la raíz del proyecto.
"""
import hashlib
import os
from pathlib import Path
from dotenv import load_dotenv

from ..paths import ENV_FILE

load_dotenv(ENV_FILE)

_SALT = os.environ.get("BATS_VOTER_SALT", "bats-default-salt-changeme")


def hash_username(username: str) -> str:
    """SHA-256(SALT + username.lower()) → hex 64 chars."""
    return hashlib.sha256(f"{_SALT}{username.strip().lower()}".encode()).hexdigest()
