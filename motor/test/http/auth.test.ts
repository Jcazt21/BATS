import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWTPayload } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { HttpError } from '../../src/http/errors.js';
import { crearIdentify, exigirTokenServicio, type Cuenta } from '../../src/http/auth.js';

const SUPABASE = 'https://proyecto.supabase.co';
const ENV = { BATS_SUPABASE_URL: SUPABASE };
const SUB = '11111111-1111-4111-8111-111111111111';

let privada: CryptoKey;
let otraPrivada: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const par = await generateKeyPair('ES256');
  privada = par.privateKey;
  otraPrivada = (await generateKeyPair('ES256')).privateKey;
  const jwk = { ...(await exportJWK(par.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

async function token(
  over: JWTPayload = {},
  opciones: { clave?: CryptoKey; expira?: string; aud?: string; iss?: string } = {},
) {
  return new SignJWT({ email: 'Ana@Liga.test', ...over })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(SUB)
    .setAudience(opciones.aud ?? 'authenticated')
    .setIssuer(opciones.iss ?? `${SUPABASE}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime(opciones.expira ?? '5m')
    .sign(opciones.clave ?? privada);
}

const cuentas: Record<string, Cuenta> = {
  'ana@liga.test': { userId: null, username: 'ana', isAdmin: false },
  'root@liga.test': { userId: SUB, username: 'root', isAdmin: true },
  'otra@liga.test': { userId: '22222222-2222-4222-8222-222222222222', username: 'otra', isAdmin: false },
};
const buscarCuenta = async (email: string) => cuentas[email] ?? null;
const identify: ReturnType<typeof crearIdentify> = request => crearIdentify({ env: ENV, jwks, buscarCuenta })(request);

const pedir = (jwt?: string) =>
  new Request('https://bats.test/api/motor/battles/1', { headers: jwt ? { authorization: `Bearer ${jwt}` } : {} });

async function fallo(promesa: Promise<unknown>): Promise<HttpError> {
  const error = await promesa.then(() => null, e => e);
  expect(error).toBeInstanceOf(HttpError);
  return error as HttpError;
}

describe('identify (I5)', () => {
  it('sin token → 401', async () => {
    expect((await fallo(identify(pedir()))).status).toBe(401);
  });

  it('cabecera sin esquema Bearer → 401', async () => {
    const req = new Request('https://bats.test/x', { headers: { authorization: await token() } });
    expect((await fallo(identify(req))).status).toBe(401);
  });

  it('firma de otra clave → 401', async () => {
    expect((await fallo(identify(pedir(await token({}, { clave: otraPrivada }))))).status).toBe(401);
  });

  it('token expirado → 401', async () => {
    expect((await fallo(identify(pedir(await token({}, { expira: '-1m' }))))).status).toBe(401);
  });

  it('audiencia incorrecta → 401', async () => {
    expect((await fallo(identify(pedir(await token({}, { aud: 'otra' }))))).status).toBe(401);
  });

  it('emisor incorrecto → 401', async () => {
    expect((await fallo(identify(pedir(await token({}, { iss: 'https://malo.test/auth/v1' }))))).status).toBe(401);
  });

  it('email no dado de alta → 403', async () => {
    expect((await fallo(identify(pedir(await token({ email: 'nadie@liga.test' }))))).status).toBe(403);
  });

  it('cuenta vinculada a otro usuario → 403', async () => {
    expect((await fallo(identify(pedir(await token({ email: 'otra@liga.test' }))))).status).toBe(403);
  });

  it('válido → identidad {username, isAdmin}; el email se normaliza a minúsculas', async () => {
    expect(await identify(pedir(await token()))).toEqual({ username: 'ana', isAdmin: false });
    expect(await identify(pedir(await token({ email: 'root@liga.test' })))).toEqual({ username: 'root', isAdmin: true });
  });

  it('sin BATS_SUPABASE_URL → 503 (falla cerrado)', async () => {
    const sinUrl = crearIdentify({ env: {}, jwks, buscarCuenta });
    expect((await fallo(sinUrl(pedir(await token())))).status).toBe(503);
  });
});

describe('exigirTokenServicio', () => {
  const env = { BATS_MOTOR_TOKEN: 'secreto-de-servicio' };
  const conToken = (t?: string) =>
    new Request('https://bats.test/x', { headers: t ? { authorization: `Bearer ${t}` } : {} });

  it('token correcto pasa', () => {
    expect(() => exigirTokenServicio(conToken('secreto-de-servicio'), 'BATS_MOTOR_TOKEN', env)).not.toThrow();
  });

  it.each([undefined, 'otro', 'secreto-de-servicio-x', ''])('token %j → 401', t => {
    expect(() => exigirTokenServicio(conToken(t), 'BATS_MOTOR_TOKEN', env)).toThrowError(
      expect.objectContaining({ status: 401 }),
    );
  });

  it('variable sin definir → 503, aunque llegue algún token', () => {
    expect(() => exigirTokenServicio(conToken('lo-que-sea'), 'BATS_MOTOR_TOKEN', {})).toThrowError(
      expect.objectContaining({ status: 503 }),
    );
  });
});
