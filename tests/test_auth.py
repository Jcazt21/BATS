"""
tests/test_auth.py
==================
Autenticación con Supabase Auth (JWKS) y cierre de las rutas de jugador.
No necesita base de datos ni red: el JWKS y player_accounts se simulan.

Ejecutar con: python -m pytest tests/test_auth.py -v
"""
import os
import time
import unittest
from unittest import mock

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwk, jwt

from bats_core.api import auth
from bats_core.api.main import app as real_app

SUPABASE_URL = "https://proyecto.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"


def _make_key(kid: str):
    private = ec.generate_private_key(ec.SECP256R1())
    private_pem = private.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    public_pem = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode()
    public_jwk = jwk.construct(public_pem, "ES256").to_dict()
    public_jwk.update(kid=kid, use="sig")
    return private_pem, public_jwk


PRIVATE_PEM, PUBLIC_JWK = _make_key("k1")
OTHER_PEM, _ = _make_key("k1")   # misma kid, otra clave: firma que no coincide con el JWKS

USER_ID = "11111111-1111-1111-1111-111111111111"


def _token(*, key=PRIVATE_PEM, email="ash@liga.test", sub=USER_ID, aud="authenticated",
           iss=ISSUER, exp_in=3600, kid="k1", alg="ES256") -> str:
    claims = {"sub": sub, "email": email, "aud": aud, "iss": iss, "exp": int(time.time()) + exp_in}
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid})


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class FakeDB:
    """Reemplaza get_db(): guarda player_accounts en memoria."""
    accounts: list[dict] = []
    updates: list[tuple] = []

    def __enter__(self): return self
    def __exit__(self, *exc): return None

    def fetchone(self, sql, params=None):
        email = params[0]
        return next((dict(a) for a in self.accounts if a["email"].lower() == email), None)

    def execute(self, sql, params=None):
        FakeDB.updates.append(params)


def _account(**kw):
    base = {"account_id": 1, "user_id": None, "email": "ash@liga.test", "username": "ash", "is_admin": False}
    return {**base, **kw}


mini = FastAPI()


@mini.get("/player")
def _player(p: dict = Depends(auth.require_player)):
    return p


@mini.get("/admin")
def _admin(p: dict = Depends(auth.require_admin)):
    return p


@mini.get("/service")
def _service(_: None = Depends(auth.service_token("TEST_SERVICE_TOKEN"))):
    return {"ok": True}


class AuthCase(unittest.TestCase):
    def setUp(self):
        FakeDB.accounts = [_account()]
        FakeDB.updates = []
        auth._jwks_cache.update(keys=None, fetched_at=0.0)
        patches = [
            mock.patch.dict(os.environ, {"BATS_SUPABASE_URL": SUPABASE_URL, "TEST_SERVICE_TOKEN": "s3cret"}),
            mock.patch.object(auth, "_get_jwks", lambda force=False: [PUBLIC_JWK]),
            mock.patch.object(auth, "get_db", FakeDB),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(mini)


class TestRequirePlayer(AuthCase):

    def test_sin_header_es_401_no_403(self):
        self.assertEqual(self.client.get("/player").status_code, 401)

    def test_token_valido_y_cuenta_registrada(self):
        r = self.client.get("/player", headers=_h(_token()))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["username"], "ash")
        self.assertFalse(r.json()["is_admin"])

    def test_primer_login_enlaza_user_id(self):
        self.client.get("/player", headers=_h(_token()))
        self.assertEqual(FakeDB.updates, [(USER_ID, 1)])

    def test_cuenta_vinculada_a_otro_usuario(self):
        FakeDB.accounts = [_account(user_id="22222222-2222-2222-2222-222222222222")]
        self.assertEqual(self.client.get("/player", headers=_h(_token())).status_code, 403)

    def test_email_no_registrado(self):
        r = self.client.get("/player", headers=_h(_token(email="intruso@x.test")))
        self.assertEqual(r.status_code, 403)

    def test_email_sin_distinguir_mayusculas(self):
        r = self.client.get("/player", headers=_h(_token(email="ASH@Liga.Test")))
        self.assertEqual(r.status_code, 200)

    def test_firma_de_otra_clave(self):
        self.assertEqual(self.client.get("/player", headers=_h(_token(key=OTHER_PEM))).status_code, 401)

    def test_token_expirado(self):
        self.assertEqual(self.client.get("/player", headers=_h(_token(exp_in=-10))).status_code, 401)

    def test_audiencia_incorrecta(self):
        self.assertEqual(self.client.get("/player", headers=_h(_token(aud="anon"))).status_code, 401)

    def test_emisor_incorrecto(self):
        self.assertEqual(self.client.get("/player", headers=_h(_token(iss="https://otro.supabase.co/auth/v1"))).status_code, 401)

    def test_kid_desconocida(self):
        self.assertEqual(self.client.get("/player", headers=_h(_token(kid="nope"))).status_code, 401)

    def test_hs256_firmado_con_el_secreto_viejo_no_pasa(self):
        # El ataque clásico: aceptar HS256 permitiría firmar con cualquier secreto conocido.
        forged = jwt.encode({"sub": USER_ID, "email": "ash@liga.test", "aud": "authenticated", "iss": ISSUER,
                             "exp": int(time.time()) + 3600}, "bats-default-salt-changeme",
                            algorithm="HS256", headers={"kid": "k1"})
        self.assertEqual(self.client.get("/player", headers=_h(forged)).status_code, 401)

    def test_basura(self):
        self.assertEqual(self.client.get("/player", headers=_h("no.es.jwt")).status_code, 401)


class TestRequireAdmin(AuthCase):

    def test_jugador_normal_es_403(self):
        self.assertEqual(self.client.get("/admin", headers=_h(_token())).status_code, 403)

    def test_admin_pasa(self):
        FakeDB.accounts = [_account(is_admin=True)]
        self.assertEqual(self.client.get("/admin", headers=_h(_token())).status_code, 200)

    def test_supabase_url_ausente(self):
        with mock.patch.dict(os.environ, {"BATS_SUPABASE_URL": ""}):
            self.assertEqual(self.client.get("/admin", headers=_h(_token())).status_code, 503)


class TestServiceToken(AuthCase):

    def test_sin_header_es_401(self):
        self.assertEqual(self.client.get("/service").status_code, 401)

    def test_token_incorrecto(self):
        self.assertEqual(self.client.get("/service", headers=_h("x")).status_code, 401)

    def test_token_correcto(self):
        self.assertEqual(self.client.get("/service", headers=_h("s3cret")).status_code, 200)

    def test_no_configurado_falla_cerrado(self):
        with mock.patch.dict(os.environ, {"TEST_SERVICE_TOKEN": ""}):
            self.assertEqual(self.client.get("/service", headers=_h("s3cret")).status_code, 503)


class TestRutasReales(unittest.TestCase):
    """La API real: ninguna ruta de jugador o admin responde sin sesión."""

    def setUp(self):
        self.client = TestClient(real_app)

    def test_me_exige_sesion_y_devuelve_la_identidad(self):
        self.assertEqual(self.client.get("/api/me").status_code, 401)
        from bats_core.api import auth as auth_mod
        real_app.dependency_overrides[auth_mod.require_player] = lambda: {
            "user_id": "u", "email": "ash@x.test", "username": "Ash", "is_admin": True}
        try:
            r = self.client.get("/api/me")
        finally:
            real_app.dependency_overrides.pop(auth_mod.require_player, None)
        self.assertEqual(r.json(), {"username": "Ash", "email": "ash@x.test", "is_admin": True})

    def test_rutas_de_equipo_exigen_sesion(self):
        for method, path in [
            ("get", "/api/teams/me"), ("get", "/api/teams/me/banned"), ("post", "/api/teams/me"),
            ("post", "/api/teams/me/pokemon"), ("delete", "/api/teams/me/pokemon/1"),
            ("get", "/api/teams/otro_jugador"),
        ]:
            with self.subTest(route=f"{method} {path}"):
                r = getattr(self.client, method)(path, **({"json": {"pokemon": []}} if method == "post" else {}))
                self.assertEqual(r.status_code, 401)

    def test_me_no_lo_captura_la_ruta_username(self):
        # Si /{username} se declarara antes, /me se trataría como un jugador llamado "me".
        # Se mira el router de teams y no real_app.routes: desde starlette 1.x los
        # routers incluidos no se aplanan en app.routes.
        from bats_core.api.routes import teams
        paths = [r.path for r in teams.router.routes]
        self.assertLess(paths.index("/api/teams/me"), paths.index("/api/teams/{username}"))

    def test_votar_exige_sesion(self):
        self.assertEqual(self.client.post("/api/ban/submit", json={"pokemon_name": "Garchomp"}).status_code, 401)
        self.assertEqual(self.client.get("/api/ban/me").status_code, 401)

    def test_el_body_de_voto_ya_no_acepta_username(self):
        from bats_core.api.routes.ban import SubmitBanRequest
        self.assertNotIn("username", SubmitBanRequest.model_fields)

    def test_admin_exige_sesion(self):
        for method, path in [("get", "/api/admin/players"), ("get", "/api/admin/battles"),
                             ("post", "/api/admin/reset-battles"), ("get", "/api/admin/seasons"),
                             ("get", "/api/admin/leaguesettings"), ("get", "/api/admin/etl/files")]:
            with self.subTest(route=f"{method} {path}"):
                self.assertEqual(getattr(self.client, method)(path).status_code, 401)

    def test_el_login_por_contrasena_ya_no_existe(self):
        r = self.client.post("/api/admin/login", json={"password": "bats-default-salt-changeme"})
        self.assertIn(r.status_code, (404, 405))

    def test_rutas_publicas_de_lectura_no_piden_sesion(self):
        paths = set(real_app.openapi()["paths"])
        for p in ("/api/ban/ranking", "/api/ban/status", "/api/ban/active",
                  "/api/teams/active-season", "/api/stats/summary"):
            self.assertIn(p, paths)


if __name__ == "__main__":
    unittest.main()
