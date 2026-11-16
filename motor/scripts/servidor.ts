import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Adapta `node:http` al `fetch` Web que usa el motor (el mismo que invoca Vercel). */
export function crearServidor(app: { fetch: (request: Request) => Promise<Response> }): Server {
  return createServer(async (req: IncomingMessage, res) => {
    try {
      const cuerpo = req.method === 'GET' || req.method === 'HEAD' ? undefined : await leer(req);
      const headers = new Headers();
      for (const [clave, valor] of Object.entries(req.headers)) {
        if (valor !== undefined) headers.set(clave, Array.isArray(valor) ? valor.join(', ') : valor);
      }
      const respuesta = await app.fetch(
        new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, { method: req.method, headers, body: cuerpo }),
      );
      res.writeHead(respuesta.status, Object.fromEntries(respuesta.headers));
      res.end(Buffer.from(await respuesta.arrayBuffer()));
    } catch (error) {
      console.error('[motor:dev]', error);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Error interno del servidor local', code: 'internal' }));
    }
  });
}

function leer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const trozos: Buffer[] = [];
    req.on('data', t => trozos.push(t));
    req.on('end', () => resolver(Buffer.concat(trozos)));
    req.on('error', rechazar);
  });
}

/** Escucha en `puerto` (0 = uno libre) y devuelve el servidor y su URL base. */
export async function escuchar(servidor: Server, puerto = 0): Promise<{ url: string; cerrar: () => Promise<void> }> {
  await new Promise<void>(resolver => servidor.listen(puerto, '127.0.0.1', resolver));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    cerrar: () => new Promise<void>(resolver => servidor.close(() => resolver())),
  };
}
