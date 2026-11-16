"""
tests/test_arena_schema.py
==========================
Esquema `arena` (migración v16): idempotencia, tablas e índices, RLS, fronteras de esquema (I9),
`arena.notify` sin Realtime (I6) y restricciones.

Requiere una base DESECHABLE:  eval "$(tools/arena_testdb.sh up)"
"""
import os
import unittest
from pathlib import Path

import psycopg2

from tests.arena_db import assert_test_dsn

DSN = os.environ.get("BATS_TEST_DSN")
DB_DIR = Path(__file__).parent.parent / "bats_core" / "db"


class TestGuardia(unittest.TestCase):
    """I13 (lado Python): no necesita base."""

    def test_acepta_base_de_test(self):
        self.assertEqual(assert_test_dsn("postgresql://u@localhost/bats_test", {}), "postgresql://u@localhost/bats_test")

    def test_rechaza_dsn_igual_al_real(self):
        dsn = "postgresql://u@localhost/bats_test"
        with self.assertRaises(RuntimeError):
            assert_test_dsn(dsn, {"BATS_DB_DSN": dsn})

    def test_rechaza_supabase_y_sin_test(self):
        for dsn in ("postgresql://u@x.supabase.co/test", "postgresql://u@localhost/bats", None):
            with self.assertRaises(RuntimeError):
                assert_test_dsn(dsn, {})


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestEsquemaArena(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        assert_test_dsn(DSN)
        from bats_core.db.connection import BATSDatabase
        with BATSDatabase(DSN) as db:
            db.apply_schema(DB_DIR / "schema.sql")
            db.apply_migrations(DB_DIR / "migrations")
        cls.conn = psycopg2.connect(DSN)
        cls.conn.autocommit = True

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def q(self, sql, params=None):
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall() if cur.description else None

    def test_aplicar_dos_veces_no_falla(self):
        from bats_core.db.connection import BATSDatabase
        with BATSDatabase(DSN) as db:
            db.apply_migrations(DB_DIR / "migrations")
            db.apply_migrations(DB_DIR / "migrations")

    def test_existen_tablas_e_indices(self):
        tablas = {r[0] for r in self.q("SELECT tablename FROM pg_tables WHERE schemaname = 'arena'")}
        self.assertEqual(tablas, {"challenges", "battles", "battle_updates"})
        indices = {r[0] for r in self.q("SELECT indexname FROM pg_indexes WHERE schemaname = 'arena'")}
        for esperado in (
            "uq_challenges_pair_pending", "ix_challenges_challenged_pending", "ix_challenges_season",
            "ix_battles_p1_live", "ix_battles_p2_live", "ix_battles_deadline",
            "ix_battles_ingest_pending", "ix_battles_season", "ix_battles_challenge",
        ):
            self.assertIn(esperado, indices)

    def test_rls_activo_en_las_tres_tablas(self):
        filas = self.q(
            "SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'arena' AND c.relkind = 'r'"
        )
        self.assertEqual(len(filas), 3)
        self.assertTrue(all(rls for _, rls in filas), filas)

    def test_i9_sin_fks_entre_esquemas_de_arena_y_battle(self):
        """arena no apunta a battle, y ni battle ni tournament apuntan a arena."""
        filas = self.q(
            """
            SELECT ns.nspname, nt.nspname FROM pg_constraint c
            JOIN pg_class cs ON cs.oid = c.conrelid  JOIN pg_namespace ns ON ns.oid = cs.relnamespace
            JOIN pg_class ct ON ct.oid = c.confrelid JOIN pg_namespace nt ON nt.oid = ct.relnamespace
            WHERE c.contype = 'f'
            """
        )
        # tournament.team_violations ya referenciaba a battle.* antes de arena: no es asunto de este esquema.
        prohibidos = {("arena", "battle"), ("battle", "arena"), ("tournament", "arena")}
        self.assertEqual(prohibidos & set(filas), set())
        # arena sí puede (y debe) referenciar a tournament.seasons.
        self.assertIn(("arena", "tournament"), set(filas))

    def test_notify_no_lanza_sin_realtime(self):
        self.q("SELECT arena.notify('arena:lobby', 'changed', '{}'::jsonb)")
        self.q("""SELECT arena.notify('battle:1', 'update', '{"seq":3}'::jsonb)""")

    def test_notify_degrada_errores_de_realtime_a_warning(self):
        """Con un realtime.send que lanza, notify sigue sin propagar el error (I6)."""
        self.q("CREATE SCHEMA IF NOT EXISTS realtime")
        try:
            self.q(
                "CREATE FUNCTION realtime.send(jsonb, text, text, boolean) RETURNS void LANGUAGE plpgsql "
                "AS $$ BEGIN RAISE EXCEPTION 'partición inexistente'; END $$"
            )
            self.q("SELECT arena.notify('battle:1', 'update', '{}'::jsonb)")
        finally:
            self.q("DROP SCHEMA realtime CASCADE")

    def _temporada(self):
        return self.q(
            "INSERT INTO tournament.seasons (season_name, type_of_month, start_date, is_active) "
            "VALUES (%s, 'Ice', CURRENT_DATE, FALSE) RETURNING season_id",
            (f"arena-schema-{os.getpid()}-{id(self)}",),
        )[0][0]

    def test_checks_rechazan_estados_invalidos(self):
        s = self._temporada()
        malos = [
            ("INSERT INTO arena.challenges (season_id, kind, challenger, challenged, expires_at) "
             "VALUES (%s, 'otro', 'a', 'b', now())", (s,)),
            ("INSERT INTO arena.challenges (season_id, kind, challenger, challenged, expires_at, status) "
             "VALUES (%s, 'league', 'a', 'b', now(), 'raro')", (s,)),
            ("INSERT INTO arena.challenges (season_id, kind, challenger, challenged, expires_at) "
             "VALUES (%s, 'league', 'a', 'a', now())", (s,)),
            ("INSERT INTO arena.battles (season_id, kind, format_id, rules, p1, p2, status) "
             "VALUES (%s, 'league', 'f', 'r', 'a', 'b', 'raro')", (s,)),
            ("INSERT INTO arena.battles (season_id, kind, format_id, rules, p1, p2) "
             "VALUES (%s, 'league', 'f', 'r', 'a', 'a')", (s,)),
            ("INSERT INTO arena.battles (season_id, kind, format_id, rules, p1, p2, end_type) "
             "VALUES (%s, 'league', 'f', 'r', 'a', 'b', 'raro')", (s,)),
            ("INSERT INTO arena.battles (season_id, kind, format_id, rules, p1, p2, ingest_status) "
             "VALUES (%s, 'league', 'f', 'r', 'a', 'b', 'raro')", (s,)),
        ]
        for sql, params in malos:
            with self.assertRaises(psycopg2.errors.CheckViolation, msg=sql):
                self.q(sql, params)

    def test_indice_unico_un_reto_pendiente_por_pareja_en_cualquier_orden(self):
        s = self._temporada()
        self.q("DELETE FROM arena.challenges WHERE challenger IN ('ana', 'beto')")
        ins = ("INSERT INTO arena.challenges (season_id, kind, challenger, challenged, expires_at, status) "
               "VALUES (%s, 'league', %s, %s, now(), %s)")
        self.q(ins, (s, "ana", "beto", "pending"))
        with self.assertRaises(psycopg2.errors.UniqueViolation):
            self.q(ins, (s, "ana", "beto", "pending"))
        with self.assertRaises(psycopg2.errors.UniqueViolation):
            self.q(ins, (s, "beto", "ana", "pending"))
        # Una vez resuelto, la pareja puede volver a retarse.
        self.q("UPDATE arena.challenges SET status = 'declined' WHERE challenger = 'ana' AND season_id = %s", (s,))
        self.q(ins, (s, "beto", "ana", "pending"))

    def test_battle_updates_se_borra_con_su_batalla(self):
        s = self._temporada()
        bid = self.q(
            "INSERT INTO arena.battles (season_id, kind, format_id, rules, p1, p2) "
            "VALUES (%s, 'league', 'f', 'r', 'a', 'b') RETURNING battle_id", (s,))[0][0]
        self.q("INSERT INTO arena.battle_updates (battle_id, seq, lines) VALUES (%s, 1, ARRAY['|start'])", (bid,))
        with self.assertRaises(psycopg2.errors.UniqueViolation):
            self.q("INSERT INTO arena.battle_updates (battle_id, seq, lines) VALUES (%s, 1, ARRAY['|x'])", (bid,))
        self.q("DELETE FROM arena.battles WHERE battle_id = %s", (bid,))
        self.assertEqual(self.q("SELECT count(*) FROM arena.battle_updates WHERE battle_id = %s", (bid,))[0][0], 0)


if __name__ == "__main__":
    unittest.main()
