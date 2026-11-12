import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/**
 * Solo desarrollo (`npm run dev:mock`): responde las rutas de sesión y roster con `dev-mocks/data.json`
 * para ver la Home sin Supabase ni API. El resto de /api sigue yendo al proxy.
 */
export function mockApi(): Plugin {
  const data = () => JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"));
  const rutas: Record<string, string> = {
    "/api/me": "me",
    "/api/teams/me": "roster",
    "/api/teams/active-season": "season",
  };
  return {
    name: "bats-mock-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const clave = req.method === "GET" ? rutas[(req.url ?? "").split("?")[0]] : undefined;
        if (!clave) return next();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data()[clave]));
      });
    },
  };
}
