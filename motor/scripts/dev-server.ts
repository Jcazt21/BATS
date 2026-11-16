/**
 * Servidor local del motor (F2.11): el mismo `fetch` que ejecuta Vercel, sobre `node:http`.
 *
 *   npm run motor:dev          # http://127.0.0.1:8012  (el proxy de web/vite.config.ts apunta aquí)
 *
 * Carga `.env` de la raíz. Necesita BATS_DB_DSN, BATS_SUPABASE_URL y BATS_ARENA_MODE.
 * Para probar sin tocar la base real, arráncalo con BATS_DB_DSN apuntando a una base desechable
 * (`tools/arena_testdb.sh up`).
 */
import { existsSync } from 'node:fs';

import handler from '../src/http/handler.js';
import { crearServidor, escuchar } from './servidor.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const puerto = Number(process.env.BATS_MOTOR_PORT ?? 8012);
const { url } = await escuchar(crearServidor(handler), puerto);
console.log(`[motor:dev] escuchando en ${url} · BATS_ARENA_MODE=${process.env.BATS_ARENA_MODE ?? 'off (por defecto)'}`);
