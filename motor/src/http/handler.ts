import { health } from './health.js';
import { createRouter, type Ruta } from './router.js';

const rutas: Ruta[] = [
  { method: 'GET', path: '/health', publica: true, handler: health },
];

/** Entrypoint con firma Web estándar: es lo que Vercel invoca (vía `api/motor.ts`). */
export default { fetch: createRouter(rutas) };
