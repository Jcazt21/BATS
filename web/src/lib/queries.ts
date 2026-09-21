/**
 * Hooks de datos: la única puerta de las páginas a la API.
 * Dan caché, deduplicación, reintentos y cancelación. Las claves viven aquí para que
 * invalidar tras una mutación no dependa de strings repartidos por las páginas.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useSession } from "@/lib/session";

export const keys = {
  seasons: ["seasons"] as const,
  summary: (s?: number) => ["stats", "summary", s ?? "all"] as const,
  mvp: (s?: number) => ["stats", "mvp", s ?? "all"] as const,
  pickrate: (s?: number) => ["stats", "pickrate", s ?? "all"] as const,
  leaderboard: (s?: number) => ["stats", "leaderboard", s ?? "all"] as const,
  pokedex: (s?: number) => ["pokedex", s ?? "all"] as const,
  pokedexEntry: (sp: string, s?: number) => ["pokedex", "entry", sp.toLowerCase(), s ?? "all"] as const,
  player: (u: string, s?: number) => ["player", u.toLowerCase(), s ?? "all"] as const,
  banRanking: ["ban", "ranking"] as const,
  banStatus: ["ban", "status"] as const,
  banCandidates: (min: number) => ["ban", "candidates", min] as const,
  activeSeason: ["active-season"] as const,
  me: ["me"] as const,
  roster: ["team", "me"] as const,
  rosterBans: ["team", "me", "banned"] as const,
  rotations: ["team", "me", "history"] as const,
  admin: {
    seasons: ["admin", "seasons"] as const,
    battles: ["admin", "battles"] as const,
    bans: ["admin", "bans"] as const,
    players: ["admin", "players"] as const,
    settings: ["admin", "leaguesettings"] as const,
    ingest: ["admin", "ingest"] as const,
    whitelist: (seasonId: number) => ["admin", "whitelist", seasonId] as const,
    votes: (seasonId: number) => ["admin", "votes", seasonId] as const,
    seasonBans: (seasonId: number) => ["admin", "season-bans", seasonId] as const,
    banViolations: (seasonId: number) => ["admin", "ban-violations", seasonId] as const,
    teamViolations: (seasonId: number) => ["admin", "team-violations", seasonId] as const,
  },
};

// ── Públicos ──────────────────────────────────────────────────────────────────

export const useSeasons = () => useQuery({ queryKey: keys.seasons, queryFn: api.getPublicSeasons });
export const useSummary = (s?: number) => useQuery({ queryKey: keys.summary(s), queryFn: () => api.getLeagueSummary(s) });
export const useMvp = (s?: number) => useQuery({ queryKey: keys.mvp(s), queryFn: () => api.getMvpTop5(s) });
export const usePickRate = (s?: number) => useQuery({ queryKey: keys.pickrate(s), queryFn: () => api.getPickRate(s) });
export const useLeaderboard = (s?: number) => useQuery({ queryKey: keys.leaderboard(s), queryFn: () => api.getLeaderboard(s) });
export const usePokedex = (s?: number) => useQuery({ queryKey: keys.pokedex(s), queryFn: () => api.getPokedex(s) });
export const usePokedexEntry = (species: string, s?: number) =>
  useQuery({ queryKey: keys.pokedexEntry(species, s), queryFn: () => api.getPokedexEntry(species, s) });
export const usePlayerProfile = (username: string, s?: number) =>
  useQuery({ queryKey: keys.player(username, s), queryFn: () => api.getPlayerProfile(username, s) });

/** La votación se mira en vivo: refresco cada 10 s mientras la pestaña esté visible. */
export const useBanRanking = () =>
  useQuery({ queryKey: keys.banRanking, queryFn: api.getBanRanking, refetchInterval: 10_000, staleTime: 5_000 });
export const useBanStatus = () =>
  useQuery({ queryKey: keys.banStatus, queryFn: api.getBanStatus, refetchInterval: 10_000, staleTime: 5_000 });
export const useBanCandidates = (minBattles = 3) =>
  useQuery({ queryKey: keys.banCandidates(minBattles), queryFn: () => api.getBanCandidates(minBattles) });
export const useActiveSeason = () => useQuery({ queryKey: keys.activeSeason, queryFn: api.getActiveSeason });

// ── Con sesión ────────────────────────────────────────────────────────────────

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

/** Checklist en vivo: se recalcula al cambiar el equipo y conserva el resultado anterior mientras tanto. */
export function useTeamChecklist(pokemon: api.PokemonPayload[]) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["team", "validate", JSON.stringify(pokemon.map((p) => [p.name, p.held_item, p.color, p.generation, p.egg_groups, p.types]))],
    queryFn: ({ signal }) => api.validateTeam(pokemon, signal),
    enabled: !!session && pokemon.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
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
export const useAdminPlayers = () => useQuery({ queryKey: keys.admin.players, queryFn: api.getPlayerAccounts });
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
