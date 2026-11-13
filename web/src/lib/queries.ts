/**
 * Hooks de datos: la única puerta de las páginas a la API.
 * Dan caché, deduplicación, reintentos y cancelación. Las claves viven aquí para que
 * invalidar tras una mutación no dependa de strings repartidos por las páginas.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { loadDexEssentials, loadDexDetails } from "@/lib/dex/snapshot";
import { useSession } from "@/lib/session";

/** Temporada: un id, `undefined` = todas, `null` = aún no se sabe cuál (la consulta espera). */
type SeasonArg = number | null;
const seasonKey = (s?: SeasonArg) => (s === null ? "pending" : (s ?? "all"));

export const keys = {
  seasons: ["seasons"] as const,
  summary: (s?: SeasonArg) => ["stats", "summary", seasonKey(s)] as const,
  mvp: (s?: SeasonArg) => ["stats", "mvp", seasonKey(s)] as const,
  leaderboard: (s?: SeasonArg) => ["stats", "leaderboard", seasonKey(s)] as const,
  pokemonStats: (s?: SeasonArg) => ["pokemon-stats", seasonKey(s)] as const,
  pokemonStatsEntry: (sp: string, s?: number) => ["pokemon-stats", "entry", sp.toLowerCase(), s ?? "all"] as const,
  player: (u: string, s?: number) => ["player", u.toLowerCase(), s ?? "all"] as const,
  playerPokedex: (u: string) => ["player", u.toLowerCase(), "pokedex"] as const,
  banRanking: ["ban", "ranking"] as const,
  banStatus: ["ban", "status"] as const,
  banCandidates: (min: number) => ["ban", "candidates", min] as const,
  activeSeason: ["active-season"] as const,
  me: ["me"] as const,
  roster: ["team", "me"] as const,
  rosterBans: ["team", "me", "banned"] as const,
  rotations: ["team", "me", "history"] as const,
  blog: ["blog"] as const,
  blogPost: (slug: string) => ["blog", slug] as const,
  admin: {
    seasons: ["admin", "seasons"] as const,
    battles: ["admin", "battles"] as const,
    bans: ["admin", "bans"] as const,
    rosters: ["admin", "rosters"] as const,
    players: ["admin", "players"] as const,
    authLogins: ["admin", "auth-logins"] as const,
    settings: ["admin", "leaguesettings"] as const,
    ingest: ["admin", "ingest"] as const,
    whitelist: (seasonId: number) => ["admin", "whitelist", seasonId] as const,
    votes: (seasonId: number) => ["admin", "votes", seasonId] as const,
    seasonBans: (seasonId: number) => ["admin", "season-bans", seasonId] as const,
    banViolations: (seasonId: number) => ["admin", "ban-violations", seasonId] as const,
    teamViolations: (seasonId: number) => ["admin", "team-violations", seasonId] as const,
    blog: ["admin", "blog"] as const,
    blogPost: (id: number) => ["admin", "blog", id] as const,
  },
};

// ── Públicos ──────────────────────────────────────────────────────────────────

export const useSeasons = () => useQuery({ queryKey: keys.seasons, queryFn: api.getPublicSeasons });
// Al cambiar de temporada se conserva lo que había (atenuado) hasta que llega lo nuevo:
// nada de volver a esqueletos ni de saltos de altura por un simple filtro. Con `null`
// esperan a saber la temporada sin pedir antes "todas" por el camino.
export const useSummary = (s?: SeasonArg) =>
  useQuery({ queryKey: keys.summary(s), queryFn: () => api.getLeagueSummary(s ?? undefined), placeholderData: keepPreviousData, enabled: s !== null });
export const useMvp = (s?: SeasonArg) =>
  useQuery({ queryKey: keys.mvp(s), queryFn: () => api.getMvpTop5(s ?? undefined), placeholderData: keepPreviousData, enabled: s !== null });
export const useLeaderboard = (s?: SeasonArg) =>
  useQuery({ queryKey: keys.leaderboard(s), queryFn: () => api.getLeaderboard(s ?? undefined), placeholderData: keepPreviousData, enabled: s !== null });
export const usePokemonStats = (s?: SeasonArg) =>
  useQuery({ queryKey: keys.pokemonStats(s), queryFn: () => api.getPokemonStats(s ?? undefined), placeholderData: keepPreviousData, enabled: s !== null });
export const usePokemonStatsEntry = (species: string, s?: number) =>
  useQuery({ queryKey: keys.pokemonStatsEntry(species, s), queryFn: () => api.getPokemonStatsEntry(species, s) });
/** Detalle pokémon a pokémon de una batalla; solo se pide cuando hay una elegida. */
export const useBattleDetails = (battleId: string | null) =>
  useQuery({ queryKey: ["stats", "battle", battleId], queryFn: () => api.getBattleDetails(battleId!), enabled: !!battleId });
/** Con `username` vacío no pide nada (p. ej. mientras aún no se sabe quién soy). */
export const usePlayerProfile = (username: string, s?: number) =>
  useQuery({ queryKey: keys.player(username, s), queryFn: () => api.getPlayerProfile(username, s), enabled: !!username });
/** Pokédex por cuenta (avistamientos). Sin `username` no pide nada. */
export const usePlayerPokedex = (username?: string) =>
  useQuery({ queryKey: keys.playerPokedex(username ?? ""), queryFn: () => api.getPlayerPokedex(username!), enabled: !!username });
export const useHeadToHead = (a?: string, b?: string, s?: SeasonArg) =>
  useQuery({
    queryKey: ["stats", "h2h", a, b, seasonKey(s)], queryFn: () => api.getHeadToHead(a!, b!, s ?? undefined),
    enabled: !!a && !!b && a !== b && s !== null, placeholderData: keepPreviousData,
  });
export const useBattlesPerDay = (days = 30, s?: number) =>
  useQuery({ queryKey: ["stats", "battles-per-day", days, s ?? "all"], queryFn: () => api.getBattlesPerDay(days, s), refetchInterval: 60_000 });
export const useRecentBattles = (limit = 8, s?: number) =>
  useQuery({ queryKey: ["stats", "recent", limit, s ?? "all"], queryFn: () => api.getRecentBattles(limit, s), refetchInterval: 60_000 });

/** La votación se mira en vivo: refresco cada 10 s mientras la pestaña esté visible. */
export const useBanRanking = () =>
  useQuery({ queryKey: keys.banRanking, queryFn: api.getBanRanking, refetchInterval: 10_000, staleTime: 5_000 });
export const useBanStatus = () =>
  useQuery({ queryKey: keys.banStatus, queryFn: api.getBanStatus, refetchInterval: 10_000, staleTime: 5_000 });
export const useBanCandidates = (minBattles = 3) =>
  useQuery({ queryKey: keys.banCandidates(minBattles), queryFn: () => api.getBanCandidates(minBattles) });
export const useActiveSeason = () => useQuery({ queryKey: keys.activeSeason, queryFn: api.getActiveSeason });
export const useBlogPosts = () => useQuery({ queryKey: keys.blog, queryFn: api.getBlogPosts });
export const useBlogPost = (slug: string) => useQuery({ queryKey: keys.blogPost(slug), queryFn: () => api.getBlogPost(slug) });

// ── Con sesión ────────────────────────────────────────────────────────────────

/** Catálogo de sprites de entrenador: casi no cambia, se guarda para toda la sesión. */
export const useTrainers = () =>
  useQuery({ queryKey: ["trainers"], queryFn: api.getTrainers, staleTime: Infinity, gcTime: Infinity });

/** Guarda el sprite del carnet y refresca `me` y los perfiles (el carnet lee el suyo de ahí). */
export function useUpdateAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateAvatar,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: keys.me }), qc.invalidateQueries({ queryKey: ["player"] })]),
  });
}

/** Quién soy (nombre de jugador y si soy admin). Solo se pide con sesión abierta. */
export function useMe() {
  const { session } = useSession();
  return useQuery({ queryKey: keys.me, queryFn: api.getMe, enabled: !!session, retry: false, staleTime: 5 * 60_000 });
}

/** Mi roster. Con `enabled` solo cuando hay sesión; 404 = aún no me he registrado. */
export function useRoster() {
  const { session } = useSession();
  return useQuery({ queryKey: keys.roster, queryFn: api.getRoster, enabled: !!session, retry: false });
}
export function usePlayerBans() {
  const { session } = useSession();
  return useQuery({ queryKey: keys.rosterBans, queryFn: api.getPlayerBans, enabled: !!session });
}
export function useRotationHistory(enabled = true) {
  const { session } = useSession();
  return useQuery({ queryKey: keys.rotations, queryFn: api.getRotationHistory, enabled: !!session && enabled });
}

export function useRegisterTeam() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.registerTeam, onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }) });
}
export function useAddPokemon() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.addPokemonToRoster, onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }) });
}
export function useSwapPokemon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { removeId: number; add: api.PokemonPayload }) => api.swapPokemon(v.removeId, v.add),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  });
}
export function useRemovePokemon() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.removePokemonFromRoster, onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }) });
}
export function useEditSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { pokemonId: number; payload: api.PokemonPayload }) => api.editSet(v.pokemonId, v.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  });
}
/** Snapshot del dex de Showdown (bats/tools/export_dex.js): estático, se cachea indefinidamente. */
export const useDexEssentials = () => useQuery({ queryKey: ["dex", "essentials"], queryFn: loadDexEssentials, staleTime: Infinity, gcTime: Infinity });
export const useDexDetails = () => useQuery({ queryKey: ["dex", "details"], queryFn: loadDexDetails, staleTime: Infinity, gcTime: Infinity });
export function useSubmitBan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.submitBan, onSuccess: () => qc.invalidateQueries({ queryKey: ["ban"] }) });
}
export const useEligibility = () => {
  const { session } = useSession();
  return useQuery({ queryKey: ["ban", "me"], queryFn: api.checkUser, enabled: !!session, retry: false });
};

// ── Administración ────────────────────────────────────────────────────────────

export const useAdminSeasons = () => useQuery({ queryKey: keys.admin.seasons, queryFn: api.getSeasons });
export const useAdminBattles = () => useQuery({ queryKey: keys.admin.battles, queryFn: api.getBattles });
export const useAdminBans = () => useQuery({ queryKey: keys.admin.bans, queryFn: api.getBans });
export const useAdminRosters = () => useQuery({ queryKey: keys.admin.rosters, queryFn: api.getAdminRosters });
export const useDexMeta = () => useQuery({ queryKey: ["dex", "meta"], queryFn: api.getDexMeta, retry: false });
export const useAdminPlayers = () => useQuery({ queryKey: keys.admin.players, queryFn: api.getPlayerAccounts });
export const useAuthLogins = () => useQuery({ queryKey: keys.admin.authLogins, queryFn: api.getAuthLogins });
export const useLeagueSettings = () => useQuery({ queryKey: keys.admin.settings, queryFn: api.getLeagueSettings });
export const useIngestLog = () => useQuery({ queryKey: keys.admin.ingest, queryFn: api.getEtlFiles });
export const useSeasonWhitelist = (id: number, enabled = true) =>
  useQuery({ queryKey: keys.admin.whitelist(id), queryFn: () => api.getSeasonWhitelist(id), enabled });
export const useSeasonVotes = (id: number, enabled = true) =>
  useQuery({ queryKey: keys.admin.votes(id), queryFn: () => api.getSeasonVotes(id), enabled });
export const useSeasonBans = (id: number, enabled = true) =>
  useQuery({ queryKey: keys.admin.seasonBans(id), queryFn: () => api.getSeasonBans(id), enabled });
export const useBanViolations = (id: number, enabled = true) =>
  useQuery({ queryKey: keys.admin.banViolations(id), queryFn: () => api.getSeasonBanViolations(id), enabled });
export const useTeamViolations = (id: number, enabled = true) =>
  useQuery({ queryKey: keys.admin.teamViolations(id), queryFn: () => api.getSeasonTeamViolations(id), enabled });

export const useAdminBlogPosts = () => useQuery({ queryKey: keys.admin.blog, queryFn: api.getAdminBlogPosts });
export const useAdminBlogPost = (id: number | null) =>
  useQuery({ queryKey: keys.admin.blogPost(id ?? 0), queryFn: () => api.getAdminBlogPost(id!), enabled: id !== null });

/** Mutación del blog: refresca el panel y lo que ven los jugadores en /blog. */
export function useBlogMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: keys.blog });
    },
  });
}

/** Mutación de administración que invalida todo lo `admin` (y las estadísticas públicas si `stats`). */
export function useAdminMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>, opts: { stats?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      if (opts.stats) void qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}
