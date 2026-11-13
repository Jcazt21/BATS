/**
 * Páginas perezosas + precarga por ruta. App.tsx las monta; el shell y los enlaces
 * las adelantan (ver lib/preload.ts) para que abrir una página no espere a la red.
 */
import { lazyPage, saveData, whenIdle, type PreloadablePage } from "@/lib/preload";
import { queryClient } from "@/lib/query-client";
import { keys } from "@/lib/queries";
import * as api from "@/lib/api";

export const pages = {
  blog: lazyPage(() => import("@/pages/BlogPage").then((m) => ({ default: m.BlogPage }))),
  blogPost: lazyPage(() => import("@/pages/BlogPostPage").then((m) => ({ default: m.BlogPostPage }))),
  stats: lazyPage(() => import("@/pages/StatsPage").then((m) => ({ default: m.StatsPage }))),
  pokedex: lazyPage(() => import("@/pages/PokedexPage").then((m) => ({ default: m.PokedexPage }))),
  pokemonStats: lazyPage(() => import("@/pages/PokemonStatsPage").then((m) => ({ default: m.PokemonStatsPage }))),
  player: lazyPage(() => import("@/pages/PlayerPage").then((m) => ({ default: m.PlayerPage }))),
  bans: lazyPage(() => import("@/pages/BansPage").then((m) => ({ default: m.BansPage }))),
  team: lazyPage(() => import("@/pages/TeamPage").then((m) => ({ default: m.TeamPage }))),
  login: lazyPage(() => import("@/pages/admin/LoginPage").then((m) => ({ default: m.LoginPage }))),
  adminLayout: lazyPage(() => import("@/pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout }))),
  statsBot: lazyPage(() => import("@/pages/admin/StatsBotPage").then((m) => ({ default: m.StatsBotPage }))),
  battles: lazyPage(() => import("@/pages/admin/BattlesPage").then((m) => ({ default: m.BattlesPage }))),
  adminBans: lazyPage(() => import("@/pages/admin/BansPage").then((m) => ({ default: m.BansPage }))),
  seasons: lazyPage(() => import("@/pages/admin/SeasonsPage").then((m) => ({ default: m.SeasonsPage }))),
  players: lazyPage(() => import("@/pages/admin/PlayersPage").then((m) => ({ default: m.PlayersPage }))),
  rosters: lazyPage(() => import("@/pages/admin/RostersPage").then((m) => ({ default: m.RostersPage }))),
  ingest: lazyPage(() => import("@/pages/admin/IngestPage").then((m) => ({ default: m.IngestPage }))),
  fairPlay: lazyPage(() => import("@/pages/admin/FairPlayPage").then((m) => ({ default: m.FairPlayPage }))),
  leagueSettings: lazyPage(() => import("@/pages/admin/LeagueSettingsPage").then((m) => ({ default: m.LeagueSettingsPage }))),
  adminBlog: lazyPage(() => import("@/pages/admin/BlogAdminPage").then((m) => ({ default: m.BlogAdminPage }))),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada página tiene sus props
type AnyPage = PreloadablePage<any>;

/** Qué chunk(s) necesita cada ruta. El orden importa: la primera coincidencia gana. */
const ROUTES: [RegExp, AnyPage[]][] = [
  [/^\/blog\/?$/, [pages.blog]],
  [/^\/blog\/[^/]+/, [pages.blogPost]],
  [/^\/stats\/?$/, [pages.stats]],
  [/^\/stats\/pokemon\/[^/]+/, [pages.pokemonStats]],
  [/^\/pokedex\/?$/, [pages.pokedex]],
  [/^\/pokedex\/[^/]+/, [pages.pokedex]],
  [/^\/j\/[^/]+/, [pages.player]],
  [/^\/bans\/?$/, [pages.bans]],
  [/^\/equipo\/?$/, [pages.team]],
  [/^\/admin\/?$/, [pages.login]],
  [/^\/admin\/stats\/bot/, [pages.adminLayout, pages.statsBot]],
  [/^\/admin\/stats/, [pages.adminLayout, pages.stats]],
  [/^\/admin\/battles/, [pages.adminLayout, pages.battles]],
  [/^\/admin\/bans/, [pages.adminLayout, pages.adminBans]],
  [/^\/admin\/seasons/, [pages.adminLayout, pages.seasons]],
  [/^\/admin\/jugadores/, [pages.adminLayout, pages.players]],
  [/^\/admin\/rosters/, [pages.adminLayout, pages.rosters]],
  [/^\/admin\/fairplay/, [pages.adminLayout, pages.fairPlay]],
  [/^\/admin\/ingestas/, [pages.adminLayout, pages.ingest]],
  [/^\/admin\/leaguesettings/, [pages.adminLayout, pages.leagueSettings]],
  [/^\/admin\/blog/, [pages.adminLayout, pages.adminBlog]],
];

const ignore = () => {};

/** Descarga el código de la página de `pathname` (idempotente y barato de repetir). */
export function preloadRoute(pathname: string): void {
  const hit = ROUTES.find(([re]) => re.test(pathname));
  hit?.[1].forEach((p) => p.preload().catch(ignore));
}

/**
 * Adelanta los datos de las fichas (jugador, pokémon) que se abren desde listas.
 * Solo si ya se conoce la temporada activa: con otra clave, la página pediría de nuevo.
 */
export function prefetchRouteData(pathname: string): void {
  // El blog no depende de la temporada activa.
  const post = /^\/blog\/([^/]+)\/?$/.exec(pathname);
  if (post) {
    const slug = decodeURIComponent(post[1]);
    void queryClient.prefetchQuery({ queryKey: keys.blogPost(slug), queryFn: () => api.getBlogPost(slug) });
    return;
  }
  if (queryClient.getQueryState(keys.activeSeason)?.status !== "success") return;
  const seasonId = queryClient.getQueryData<api.ActiveSeasonInfo | null>(keys.activeSeason)?.season_id;
  const player = /^\/j\/([^/]+)\/?$/.exec(pathname);
  if (player) {
    const u = decodeURIComponent(player[1]);
    void queryClient.prefetchQuery({ queryKey: keys.player(u, seasonId), queryFn: () => api.getPlayerProfile(u, seasonId) });
    return;
  }
  const entry = /^\/stats\/pokemon\/([^/]+)\/?$/.exec(pathname);
  if (entry) {
    const sp = decodeURIComponent(entry[1]);
    void queryClient.prefetchQuery({ queryKey: keys.pokemonStatsEntry(sp, seasonId), queryFn: () => api.getPokemonStatsEntry(sp, seasonId) });
  }
}

/** Precarga en reposo las páginas de una zona (pública o admin), salvo con ahorro de datos. */
export function preloadWhenIdle(list: AnyPage[]): () => void {
  if (saveData()) return ignore;
  return whenIdle(() => list.forEach((p) => p.preload().catch(ignore)));
}

export const publicPages: AnyPage[] = [pages.blog, pages.blogPost, pages.stats, pages.pokedex, pages.bans, pages.team, pages.player, pages.pokemonStats];
export const adminPages: AnyPage[] = [
  pages.stats, pages.battles, pages.seasons, pages.players, pages.rosters, pages.adminBans,
  pages.fairPlay, pages.ingest, pages.statsBot, pages.leagueSettings, pages.adminBlog,
];

/**
 * Escucha la intención de navegar en todo el documento: foco, dedo o clic apoyados
 * precargan código y datos al momento; el cursor encima, tras una breve pausa (para no
 * disparar peticiones al cruzar una lista con el ratón). Cubre cualquier <a> interno y
 * cualquier elemento con `data-prefetch="/ruta"` (filas de tabla que navegan al pulsar).
 */
export function installIntentPreload(): () => void {
  let hoverTimer: number | undefined;
  let hovered: Element | null = null;

  const targetOf = (e: Event): { el: Element; path: string } | null => {
    const el = (e.target as Element | null)?.closest?.("a[href], [data-prefetch]");
    if (!el) return null;
    if (el instanceof HTMLAnchorElement) {
      if (el.origin !== window.location.origin || el.target === "_blank" || el.hasAttribute("download")) return null;
      return { el, path: el.pathname };
    }
    const path = el.getAttribute("data-prefetch");
    return path ? { el, path } : null;
  };

  const now = (e: Event) => {
    const t = targetOf(e);
    if (!t) return;
    preloadRoute(t.path);
    prefetchRouteData(t.path);
  };

  const over = (e: Event) => {
    const t = targetOf(e);
    if (!t || t.el === hovered) return;
    hovered = t.el;
    preloadRoute(t.path);
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => prefetchRouteData(t.path), 120);
  };

  const out = (e: Event) => {
    const t = targetOf(e);
    if (t && t.el === hovered && !t.el.contains((e as PointerEvent).relatedTarget as Node | null)) {
      hovered = null;
      window.clearTimeout(hoverTimer);
    }
  };

  const opts: AddEventListenerOptions = { passive: true, capture: true };
  document.addEventListener("pointerdown", now, opts);
  document.addEventListener("focusin", now, opts);
  document.addEventListener("pointerover", over, opts);
  document.addEventListener("pointerout", out, opts);
  return () => {
    window.clearTimeout(hoverTimer);
    document.removeEventListener("pointerdown", now, opts);
    document.removeEventListener("focusin", now, opts);
    document.removeEventListener("pointerover", over, opts);
    document.removeEventListener("pointerout", out, opts);
  };
}
