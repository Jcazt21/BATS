"""
BATS — Backfill: reenvía logs .log.json de disco a la API.

Es la red de seguridad de la ingesta por push. Si el server de PS estuvo sin
internet (o la API caída) cuando terminó una batalla, el log igual quedó en
logs/; este comando lo envía después a POST /api/ingest/battle.

Usa solo la librería estándar (sin pandas ni psycopg2): puede correr en la
máquina de PS, que solo necesita la URL de la API y el token de ingesta, no
credenciales de la base de datos. Es idempotente: reenviar lo ya cargado
responde 'skipped', así que se puede correr las veces que haga falta.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from .parser import find_log_files

_RETRY_DELAYS = (1.0, 3.0)  # segundos; solo ante error de red / 5xx / 429


def _post(url: str, token: str, payload: dict, timeout: float) -> tuple[bool, str]:
    """Un POST con reintentos. Retorna (ok, status_o_error)."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/api/ingest/battle",
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    last = "error desconocido"
    for attempt in range(len(_RETRY_DELAYS) + 1):
        retryable = True
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return True, json.loads(resp.read().decode("utf-8")).get("status", "?")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:200]
            last = f"HTTP {exc.code}: {detail}"
            retryable = exc.code >= 500 or exc.code in (408, 429)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = f"red: {getattr(exc, 'reason', exc)}"
        if not retryable or attempt >= len(_RETRY_DELAYS):
            break
        time.sleep(_RETRY_DELAYS[attempt])
    return False, last


def backfill(
    logs_dir: Path,
    url: str,
    token: str,
    fmt: str | None = None,
    dry_run: bool = False,
    timeout: float = 30.0,
    log: Callable[[str], None] = print,
) -> dict:
    """
    Envía todos los .log.json de ``logs_dir`` a la API.

    Estructura esperada (la misma que escribe PS):
    logs/<YYYY-MM>/<formato>/<YYYY-MM-DD>/<id>.log.json

    Returns:
        {"total", "loaded", "skipped", "ignored", "failed", "failures": [...]}
    """
    url = url.rstrip("/")
    files = find_log_files(logs_dir, fmt)
    stats: dict = {"total": len(files), "loaded": 0, "skipped": 0, "ignored": 0, "failed": 0, "failures": []}

    for f in files:
        parts = f.parts
        battle_id = f.stem.replace(".log", "")
        try:
            content = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            stats["failed"] += 1
            stats["failures"].append({"file": f.name, "reason": f"archivo ilegible: {exc}"})
            continue

        if dry_run:
            log(f"[dry-run] {battle_id}  ({parts[-3]}, {parts[-2]})")
            continue

        ok, result = _post(
            url, token,
            {"battle_id": battle_id, "format": parts[-3], "date": parts[-2], "log": content},
            timeout,
        )
        if ok and result in stats:
            stats[result] += 1
            log(f"{result:8} {battle_id}")
        else:
            stats["failed"] += 1
            stats["failures"].append({"file": f.name, "reason": result})
            log(f"FALLÓ    {battle_id}: {result}")

    return stats
