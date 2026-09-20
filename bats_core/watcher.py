"""
bats_core/watcher.py
===============
Watcher de sistema de archivos para BATS.

Escucha la carpeta de logs de Pokémon Showdown y dispara el ETL
automáticamente cada vez que aparece un archivo .log.json nuevo.

Uso standalone::

    from pathlib import Path
    from bats_core.watcher import BATSWatcher

    w = BATSWatcher(logs_dir=Path("logs/"))
    w.start()   # inicia en background thread
    w.stop()    # detiene

O bloqueante::

    w.run()     # bloquea hasta Ctrl+C
"""

from __future__ import annotations

import threading
import time
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class BATSWatcher:
    """
    Vigila logs_dir y corre el ETL cuando aparece un .log.json nuevo.

    Args:
        logs_dir: Carpeta raíz de logs a vigilar.
        dsn:      Connection string PostgreSQL. None = usa BATS_DB_DSN o default.
    """

    def __init__(self, logs_dir: Path, dsn: Optional[str] = None) -> None:
        self.logs_dir = logs_dir.resolve()
        self.dsn = dsn
        self._observer = None
        self._lock = threading.Lock()
        self._pending = threading.Event()
        self._running = False

    def start(self) -> None:
        """Inicia el watcher en un background thread (no bloqueante)."""
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler

        self.logs_dir.mkdir(parents=True, exist_ok=True)

        watcher = self

        class _Handler(FileSystemEventHandler):
            def on_created(self, event):
                if not event.is_directory and event.src_path.endswith(".log.json"):
                    threading.Thread(target=watcher._run_etl, daemon=True).start()

        self._observer = Observer()
        self._observer.schedule(_Handler(), str(self.logs_dir), recursive=True)
        self._observer.start()
        logger.info("[BATS Watch] Escuchando batallas en: %s", self.logs_dir)

        # Scan inicial: procesar cualquier archivo que haya quedado sin cargar
        threading.Thread(target=self._run_etl, daemon=True, name="etl-startup").start()

    def stop(self) -> None:
        """Detiene el watcher."""
        if self._observer:
            self._observer.stop()
            self._observer.join()
            self._observer = None

    def run(self) -> None:
        """Inicia el watcher y bloquea hasta Ctrl+C."""
        self.start()
        print(f"[BATS Watch] Escuchando batallas en: {self.logs_dir}")
        print("[BATS Watch] Escaneando logs existentes sin procesar...")
        print("[BATS Watch] Ctrl+C para detener.")
        try:
            while self._observer and self._observer.is_alive():
                self._observer.join(timeout=1)
        except KeyboardInterrupt:
            self.stop()
            print("\n[BATS Watch] Detenido.")

    def _run_etl(self) -> None:
        from bats_core.db.connection import BATSDatabase
        from bats_core.db.etl import run_etl

        with self._lock:
            if self._running:
                self._pending.set()
                return
            self._running = True
            self._pending.clear()

        print("[BATS Watch] Nueva batalla detectada. Cargando a la DB...")
        try:
            with BATSDatabase(dsn=self.dsn) as db:
                stats = run_etl(self.logs_dir, db)
            print(
                f"[BATS Watch] ✔ {stats['loaded']} cargadas | "
                f"⊘ {stats['skipped']} skipped | "
                f"✖ {stats['errors']} errores"
            )
            for detail in stats.get("error_details", []):
                print(f"[BATS Watch]   ✖ {detail['file']}: {detail['reason']}")
        except Exception as exc:
            print(f"[BATS Watch] Error en ETL: {exc}")
        finally:
            with self._lock:
                self._running = False
            if self._pending.is_set():
                time.sleep(2)
                threading.Thread(target=self._run_etl, daemon=True).start()
