import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import type { Plugin } from "vite";

/**
 * Solo desarrollo (`npm run dev:mock`): responde las rutas GET públicas (sesión, equipo, stats,
 * perfiles y Pokédex) con `dev-mocks/data.json` para ver la app sin Supabase ni API.
 * `season_id` se ignora: todas las temporadas muestran los mismos datos.
 * Lo que no esté en `rutas` (y cualquier POST/PUT/DELETE) sigue yendo al proxy.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forma libre del JSON de mocks
type Data = Record<string, any>;
/** `undefined` = 404. */
type Handler = (d: Data, params: string[], query: URLSearchParams) => unknown;

// Igual que _norm() en bats_core/api/routes/pokemon_stats.py: "Landorus-Therian" == "landorustherian"
const norm = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const pokedexEntry: Handler = (d, [species]) => {
  const row = d.pokedex.species.find((r: { species: string }) => norm(r.species) === norm(species));
  return row && { ...row, total_slots: d.pokedex.total_slots, ...d.pokedex_entries[row.species] };
};

/** Mismos números que la Pokédex, con los nombres de campo de /api/stats/pickrate. */
const pickRate: Handler = (d) =>
  d.pokedex.species.map((r: Data) => ({
    species: r.species, battles_used: r.used, total_slots: d.pokedex.total_slots, usage_pct: r.pick_pct,
    avg_kills: r.avg_kills, avg_mvp_score: r.avg_mvp, win_rate_pct: r.win_rate_pct,
  }));

const rutas: [RegExp, Handler][] = [
  // Sesión y equipo
  [/^\/api\/me$/, (d) => d.me],
  [/^\/api\/teams\/active-season$/, (d) => d.season],
  [/^\/api\/teams\/me$/, (d) => d.roster],
  [/^\/api\/teams\/me\/banned$/, (d) => d.banned],
  [/^\/api\/teams\/me\/history$/, (d) => d.rotation_history],
  // Votación de bans (la Home muestra el estado)
  [/^\/api\/ban\/status$/, (d) => d.ban_status],
  [/^\/api\/ban\/me$/, (d) => d.ban_eligibility],
  // Stats
  [/^\/api\/stats\/seasons$/, (d) => d.seasons],
  [/^\/api\/stats\/summary$/, (d) => d.summary],
  [/^\/api\/stats\/mvp$/, (d) => d.mvp],
  [/^\/api\/stats\/pickrate$/, pickRate],
  [/^\/api\/stats\/leaderboard$/, (d) => d.leaderboard],
  [/^\/api\/stats\/recent-battles$/, (d, _, q) => d.recent_battles.slice(0, Number(q.get("limit") ?? 8))],
  [/^\/api\/stats\/battles\/([^/]+)$/, (d, [id]) => d.battle_details[id]],
  // Perfiles y estadísticas por especie
  [/^\/api\/players\/([^/]+)$/, (d, [user]) => d.players[user.toLowerCase()]],
  [/^\/api\/stats\/pokemon$/, (d) => d.pokedex],
  [/^\/api\/stats\/pokemon\/([^/]+)$/, pokedexEntry],
];

function json(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function mockApi(): Plugin {
  const data = (): Data => JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"));
  return {
    name: "bats-mock-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET") return next();
        const url = new URL(req.url ?? "/", "http://mock");
        for (const [patron, handler] of rutas) {
          const m = url.pathname.match(patron);
          if (!m) continue;
          const body = handler(data(), m.slice(1).map(decodeURIComponent), url.searchParams);
          return body === undefined ? json(res, { detail: "No encontrado (mock)." }, 404) : json(res, body);
        }
        next();
      });
    },
  };
}
