import { crearApp, depsDeProduccion } from './app.js';

/** Entrypoint con firma Web estándar: es lo que Vercel invoca (vía `api/motor.ts`). */
export default crearApp(depsDeProduccion());
