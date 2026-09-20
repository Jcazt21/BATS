"""
Entrypoint de Vercel (Python runtime, ASGI).

Vercel busca una variable `app` en api/index.py. Todo el código vive en
bats_core/; este archivo solo lo expone. Ver vercel.json.
"""
from bats_core.api.main import app  # noqa: F401
