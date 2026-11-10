/**
 * Cliente de la API de BATS. Cada función es una llamada tipada sobre `request`
 * (lib/http.ts): autenticación, errores y cancelación viven allí, no aquí.
 * Las páginas no llaman a estas funciones directamente sino a los hooks de lib/queries.ts.
 */
import { request } from "@/lib/http";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface WhitelistPlayer {
  voter_hash: string;
  username: string;
  added_at: string | null;
  voted: boolean;
}

export interface BanListEntry {
  pokemon_name:  string;
  pokemon_types: string | null;
  sprite_url:    string | null;
  national_dex:  number | null;
}

export interface ActiveSeasonBansResponse {
  season: {
    season_id:     number;
    season_name:   string;
    type_of_month: string;
    start_date:    string | null;
    is_active:     boolean;
  } | null;
  bans:     BanListEntry[];
  progress: { voted: number; total: number } | null;
}

export interface LeagueSummary {
  total_battles: number;
  total_players: number;
  avg_turns:     number;
  top_win_rate:  number;
}

export interface PublicSeasonEntry {
  season_id:     number;
  season_name:   string;
  type_of_month: string;
  is_active:     boolean;
  start_date:    string | null;
  end_date:      string | null;
}

export interface MvpEntry {
  species:            string;
  player:             string;
  total_mvp_score:    number;
  total_kills:        number;
  final_hits:         number;
  battles_played:     number;
  avg_mvp_per_battle: number;
}

export interface PickRateEntry {
  species:       string;
  battles_used:  number;
  total_slots:   number;
  usage_pct:     number;
  avg_kills:     number;
  avg_mvp_score: number;
  win_rate_pct:  number;
}

export interface BotSummaryEntry {
  username:      string;
  total_battles: number;
  wins:          number;
  losses:        number;
  win_rate_pct:  number;
  avg_turns:     number;
}

export interface BotPokemonEntry {
  species:        string;
  username:       string;
  times_used:     number;
  total_kills:    number;
  avg_kills:      number;
  avg_mvp_score:  number;
  total_mvp_score:number;
  times_survived: number;
  final_hits:     number;
  survival_pct:   number;
}

export interface BotBattleEntry {
  battle_id:   string;
  format_name: string;
  battle_date: string;
  player:      string;
  player_won:  boolean;
  turns:       number;
  end_type:    string;
}

export interface BattleDetailEntry {
  player: string;
  species: string;
  kills: number;
  survived: boolean;
  final_hit: boolean;
  mvp_score: string | number;
}

export interface BattleEntry {
  battle_id:   string;
  format_name: string;
  battle_date: string;
  total_turns: number;
  end_type:    string;
  p1_username: string;
  p2_username: string;
  winner:      string | null;
}

export interface LeaderboardEntry {
  username:         string;
  total_battles:    number;
  wins:             number;
  losses:           number;
  win_rate_pct:     number;
  total_survivors:  number;
}

export interface SeasonEntry {
  season_id:        number;
  season_name:      string;
  type_of_month:    string;
  start_date:       string | null;
  end_date:         string | null;
  is_active:        boolean;
  created_at:       string | null;
  total_votes:      number;
  total_bans:       number;
  max_team_size:    number;
  max_team_changes: number;
  restrictions:     SeasonRestrictions;
}

export interface SeasonBan {
  ban_id:          number;
  player_username: string;
  pokemon_name:    string;
  pokemon_types:   string | null;
  sprite_url:      string | null;
  national_dex:    number | null;
  banned_at:       string | null;
  is_active:       boolean;
  revoked_at:      string | null;
}

export interface VoteEntry {
  season_id:    number;
  pokemon_name: string;
  pokemon_types: string | null;
  sprite_url:   string | null;
  national_dex: number | null;
  total_votes:  number;
  ranking:      number;
}

export interface EtlFileEntry {
  log_id:          number;
  file_path:       string;
  file_name:       string;
  file_size:       number | null;
  battle_id:       string | null;
  status:          "ok" | "error" | "skipped";
  error_msg:       string | null;
  processed_at:    string | null;
  battle_date:     string | null;
  total_turns:     number | null;
  end_type:        string | null;
  format_name:     string | null;
  p1_username:     string | null;
  p2_username:     string | null;
  winner_username: string | null;
  season_name:     string | null;
  violation_count: number;
}

export interface DeleteFilesResult {
  ok:              boolean;
  removed_entries: number;
  battles_removed: number;
}

export interface MaintenanceResult {
  ok: boolean;
  seasons: { reset: number; updated: number; error: string | null };
}

/** All current restriction keys. Extend here when new rules are added. */
export interface SeasonRestrictions {
  required_color?:      string | null;   // PokeAPI color name or null = no restriction
  required_generation?: number | null;   // 1–9 or null = no restriction
  required_egg_group?:  string | null;   // PokeAPI egg group name or null = no restriction
  item_clause?:         boolean;         // default false
  max_paradox?:         number;          // 0–6 (6 = sin límite); lo aplica el formato de Showdown
  max_pseudo_legendary?: number;         // 0–6 (6 = sin límite); lo aplica el formato de Showdown
  max_restricted?:      number;          // 0–6 (6 = sin límite); lo aplica el formato de Showdown
  registration_closed?: boolean;         // cierra el registro y publica los equipos
  roster_enforcement?:  boolean;         // Showdown rechaza en batalla cualquier set no registrado
  [key: string]:        unknown;         // future restrictions
}

/** Spec entry returned by GET /api/admin/leaguesettings */
export interface RestrictionSpec {
  label:    string;
  hint:     string;
  values?:  string[];   // enum options
  min?:     number;     // int range
  max?:     number;
  nullable?: boolean;
  default?: boolean;    // bool default
}

/** Respaldo estático: el servidor manda el spec real (RESTRICTION_SPEC en bats_core/rules.py). */
export const DEFAULT_RESTRICTION_SPEC: Record<string, RestrictionSpec> = {
  required_color: {
    label: "Color requerido",
    hint: "Al menos un pokémon del equipo debe ser de este color.",
    values: ["black","blue","brown","gray","green","pink","purple","red","white","yellow"],
    nullable: true,
  },
  required_generation: {
    label: "Generación requerida",
    hint: "Al menos un pokémon del equipo debe ser de esta generación.",
    min: 1,
    max: 9,
    nullable: true,
  },
  required_egg_group: {
    label: "Egg Group requerido",
    hint: "Al menos un pokémon del equipo debe pertenecer a este egg group.",
    values: ["monster","water1","water2","water3","bug","flying","field","fairy","grass","human-like","mineral","amorphous","ditto","dragon","undiscovered"],
    nullable: true,
  },
  item_clause: {
    label: "Item Clause",
    hint: "No se puede repetir el mismo objeto entre los pokémon del equipo.",
    default: false,
  },
  registration_closed: {
    label: "Registro cerrado",
    hint: "Nadie puede registrar ni editar equipos, y los equipos pasan a ser públicos.",
    default: false,
  },
  max_paradox: {
    label: "Máximo de Paradox",
    hint: "Cuántos pokémon Paradox admite un equipo (6 = sin límite).",
    min: 0,
    max: 6,
  },
  max_pseudo_legendary: {
    label: "Máximo de pseudo-legendarios",
    hint: "Cuántos pseudo-legendarios (BST 600 sin tag legendario) admite un equipo (6 = sin límite).",
    min: 0,
    max: 6,
  },
};

export interface LeagueSettings {
  season_id:        number;
  season_name:      string;
  type_of_month:    string;
  max_team_size:    number;
  max_team_changes: number;
  restrictions:     SeasonRestrictions;
  restriction_spec: Record<string, RestrictionSpec>;
}

export interface ActiveSeasonInfo {
  season_id:        number;
  season_name:      string;
  type_of_month?:   string;
  max_team_size:    number;
  max_team_changes: number;
  restrictions:     SeasonRestrictions;
}

export interface RosterPokemon {
  pokemon_id: number;
  name:       string;
  types:      string | null;
  sprite_url: string | null;
  held_item:  string | null;
  ability:    string | null;
  nature:     string | null;
  tera_type:  string | null;
  moves:      string[];
  evs:        Record<string, number>;
  ivs:        Record<string, number>;
  added_at:   string | null;
  in_lineup:  boolean;
}

/** Veredicto del TeamValidator real de Showdown (Task 6), sincronizado por bats-ingest. */
export interface RosterValidation {
  state:      "ok" | "errors" | "pending";
  errors:     string[];
  checked_at: string | null;
}

export interface RosterInfo {
  username:              string;
  season_id:             number;
  season_name:           string;
  rotations_used:        number;
  rotations_remaining:   number;
  max_team_size:         number;
  max_rotations:         number;
  is_locked:             boolean;
  registered_at:         string | null;
  lineup_set:            boolean;
  pool:                  RosterPokemon[];
  validation:            RosterValidation;
}

export interface BannedPokemon {
  pokemon_id: number;
  name:       string;
  types:      string | null;
  sprite_url: string | null;
}

export interface PokemonPayload {
  name:         string;
  national_dex: number | null;
  types:        string | null;
  sprite_url:   string | null;
  held_item?:   string | null;
  ability?:     string | null;
  nature?:      string | null;
  tera_type?:   string | null;
  moves?:       string[];
  evs?:         Record<string, number>;
  ivs?:         Record<string, number>;
  color?:       string | null;
  generation?:  number | null;
  egg_groups?:  string[];
}

export interface PlayerAccount {
  account_id: number;
  email:      string;
  username:   string;
  is_admin:   boolean;
  /** uuid de auth.users si ya se enlazó; null hasta el primer login (o si se desenlazó). */
  user_id:    string | null;
  /** `user_id !== null`. Antes se llamaba `has_logged_in`, pero eso es falso: solo significa "enlazada". */
  is_linked:  boolean;
  created_at: string;
}

/** Login de Supabase Auth (auth.users), enlazado o no a una cuenta de la liga. */
export interface AuthLogin {
  user_id:           string;
  email:             string;
  provider:          string | null;
  full_name:         string | null;
  created_at:        string | null;
  last_sign_in_at:   string | null;
  linked_account_id: number | null;
  linked_username:   string | null;
}

export interface AuthLoginsResponse {
  /** false en Postgres local: el esquema auth de Supabase no existe ahí. */
  available: boolean;
  logins:    AuthLogin[];
}

/** Cuántas filas movió el rename de un username en tournament.roster/bans/ban_whitelist/ban_participation. */
export interface UsernameRenameCascade {
  roster: number; bans: number; whitelist: number; participation: number;
}

export interface BlogPostSummary {
  post_id:      number;
  slug:         string;
  title:        string;
  excerpt:      string;
  author:       string | null;
  published_at: string | null;
}

export interface BlogPost extends BlogPostSummary {
  content_md: string;
  updated_at: string | null;
}

export interface AdminBlogPost extends BlogPostSummary {
  is_published: boolean;
  created_at:   string | null;
  updated_at:   string | null;
  content_md?:  string;
}

// ── Tipos de las funciones nuevas ─────────────────────────────────────────────

export interface PlayerProfile {
  username:   string;
  first_seen: string | null;
  last_seen:  string | null;
  record: {
    battles: number; wins: number; losses: number; win_rate_pct: number | null;
    forfeits: number; survivors: number;
  };
  mvp:    { total: number; kills: number };
  streak: { type: "win" | "loss" | null; length: number };
  /** Calculadas en el servidor; `earned: false` = bloqueada. */
  badges: { id: string; glyph: string; label: string; earned: boolean }[];
  top_pokemon: { species: string; uses: number; kills: number; mvp: number; avg_mvp: number }[];
  recent: { battle_id: string; date: string | null; opponent: string; won: boolean; turns: number; end_type: string }[];
  roster: {
    season_name: string;
    pool: { name: string; types: string | null; sprite_url: string | null; held_item: string | null;
            ability: string | null; nature: string | null; tera_type: string | null; moves: string[]; in_lineup: boolean }[];
  } | null;
}

export interface PokedexRow {
  species: string; used: number; pick_pct: number | null; brought: number; bring_pct: number | null;
  win_rate_pct: number | null; avg_mvp: number; avg_kills: number;
}

export interface PokedexList { total_slots: number; species: PokedexRow[] }

export interface CountedName { name: string; count: number }

export interface PokedexEntry {
  species: string; types: string | null; sprite_url: string | null; national_dex: number | null;
  total_slots: number; used: number; pick_pct: number | null; brought: number; bring_pct: number | null;
  win_rate_pct: number | null; avg_kills: number; avg_mvp: number;
  users: { username: string; uses: number; kills: number; mvp: number }[];
  sets: {
    players: number; moves: CountedName[]; items: CountedName[]; abilities: CountedName[];
    natures: CountedName[]; tera_types: CountedName[];
  };
}

export interface BanCandidate {
  species: string; format_name: string; battles_used: number; avg_kills: number;
  avg_mvp_score: number; win_rate_pct: number; votes: number; sprite_url: string | null;
}

export interface BanRankingEntry {
  season_id: number; pokemon_name: string; pokemon_types: string | null; sprite_url: string | null;
  national_dex: number | null; total_votes: number; ranking: number;
}

export interface BanStatus { total_authorized: number; total_voted: number; total_votes_cast: number; voting_open: boolean }

export interface ChecklistRow { rule: string; label: string; ok: boolean; names: string[];
  /** `false` = informativa: no impide registrar el equipo (p. ej. tipo del mes). Por defecto bloquea. */
  blocking?: boolean }
export interface TeamValidation { ok: boolean; checklist: ChecklistRow[] }

export interface RotationHistory {
  max_rotations: number;
  rotations: { change_number: number; changed_at: string | null; battle_id: string | null; removed: string[]; added: string[] }[];
}

export interface BanViolation {
  violation_id: number; battle_id: string; player_username: string; pokemon_species: string;
  sprite_url: string | null; was_active: boolean; battle_date: string | null; detected_at: string | null;
}

export interface TeamViolation {
  violation_id: number; battle_id: string; violation_type: "not_in_roster" | "no_roster_registered" | "rotation_exceeded";
  was_active: boolean; player_username: string; pokemon_species: string; battle_date: string | null; detected_at: string | null;
}

// ── Ban ───────────────────────────────────────────────────────────────────────

export type EligibilityReason = "not_registered" | "already_voted" | null;

/** ¿Puede votar la sesión actual? El servidor responde 403 si su cuenta no está en la liga. */
export async function checkUser(): Promise<{ can_vote: boolean; reason: EligibilityReason }> {
  try {
    return await request("/api/ban/me", { auth: true });
  } catch (e) {
    if (e instanceof Error && "status" in e && (e as { status: number }).status === 403) {
      return { can_vote: false, reason: "not_registered" };
    }
    throw e;
  }
}

export const submitBan = (payload: {
  pokemon_name: string; pokemon_types: string | null; sprite_url: string | null; national_dex: number | null;
}) => request<{ ok: boolean }>("/api/ban/submit", { method: "POST", body: payload, auth: true, fallback: "Error al registrar ban" });

export const getBanRanking = () => request<BanRankingEntry[]>("/api/ban/ranking");
export const getBanStatus = () => request<BanStatus>("/api/ban/status");
export const getBanCandidates = (minBattles = 3) =>
  request<BanCandidate[]>("/api/ban/candidates", { params: { min_battles: minBattles } });

export interface Me { username: string; email: string; is_admin: boolean }
export const getMe = () => request<Me>("/api/me", { auth: true });

// ── Reglas y temporada activa ─────────────────────────────────────────────────

export const getActiveSeason = () => request<ActiveSeasonInfo>("/api/teams/active-season");

// ── Estadísticas (públicas) ───────────────────────────────────────────────────

export const getPublicSeasons = () => request<PublicSeasonEntry[]>("/api/stats/seasons");
export const getLeagueSummary = (seasonId?: number) => request<LeagueSummary>("/api/stats/summary", { params: { season_id: seasonId } });
export const getMvpTop5 = (seasonId?: number) => request<MvpEntry[]>("/api/stats/mvp", { params: { season_id: seasonId } });
export const getPickRate = (seasonId?: number) => request<PickRateEntry[]>("/api/stats/pickrate", { params: { season_id: seasonId } });
export const getLeaderboard = (seasonId?: number) => request<LeaderboardEntry[]>("/api/stats/leaderboard", { params: { season_id: seasonId } });
/** Batalla del feed de actividad. Empate: `winner` y `loser` son null. */
export interface RecentBattle {
  battle_id: string; date: string | null; winner: string | null; loser: string | null;
  players: [string, string]; turns: number; end_type: string;
}
export const getRecentBattles = (limit = 8, seasonId?: number) =>
  request<RecentBattle[]>("/api/stats/recent-battles", { params: { limit, season_id: seasonId } });
export const getBattleDetails = (battleId: string) => request<BattleDetailEntry[]>(`/api/stats/battles/${encodeURIComponent(battleId)}`);

export const getBotSummary = () => request<BotSummaryEntry[]>("/api/stats/bot/summary");
export const getBotPokemon = () => request<BotPokemonEntry[]>("/api/stats/bot/pokemon");
export const getBotBattles = () => request<BotBattleEntry[]>("/api/stats/bot/battles");
export const getBotBattleDetails = (battleId: string) => request<BattleDetailEntry[]>(`/api/stats/bot/battles/${encodeURIComponent(battleId)}`);

export const getPlayerProfile = (username: string, seasonId?: number) =>
  request<PlayerProfile>(`/api/players/${encodeURIComponent(username)}`, { params: { season_id: seasonId } });
export const getPokedex = (seasonId?: number) => request<PokedexList>("/api/pokedex", { params: { season_id: seasonId } });
export const getPokedexEntry = (species: string, seasonId?: number) =>
  request<PokedexEntry>(`/api/pokedex/${encodeURIComponent(species)}`, { params: { season_id: seasonId } });

// ── Equipo (requiere sesión) ──────────────────────────────────────────────────

export const getPlayerBans = () => request<BannedPokemon[]>("/api/teams/me/banned", { auth: true });
export const getRoster = () => request<RosterInfo>("/api/teams/me", { auth: true });
export const getRotationHistory = () => request<RotationHistory>("/api/teams/me/history", { auth: true });

export const registerTeam = (pokemon: PokemonPayload[]) =>
  request<{ roster_id: number; username: string; season_id: number; pokemon_count: number }>(
    "/api/teams/me", { method: "POST", body: { pokemon }, auth: true, fallback: "Error al registrar equipo" });
export const removePokemonFromRoster = (pokemonId: number) =>
  request<{ ok: boolean }>(`/api/teams/me/pokemon/${pokemonId}`, { method: "DELETE", auth: true, fallback: "Error al eliminar pokémon" });
export const swapPokemon = (removePokemonId: number, add: PokemonPayload) =>
  request<{ ok: boolean; pokemon_id: number }>("/api/teams/me/swap", {
    method: "POST", body: { remove_pokemon_id: removePokemonId, add }, auth: true, fallback: "Error al reemplazar el pokémon",
  });
export const addPokemonToRoster = (pokemon: PokemonPayload[]) =>
  request<{ ok: boolean; added: number }>("/api/teams/me/pokemon", { method: "POST", body: { pokemon }, auth: true, fallback: "Error al agregar pokémon" });
/** Cambia el set de un pokémon ya registrado (objeto/habilidad/naturaleza/tera/movimientos/EVs/IVs)
 *  sin consumir cambios. Para cambiar de especie está `swapPokemon`. */
export const editSet = (pokemonId: number, payload: PokemonPayload) =>
  request<{ ok: boolean }>(`/api/teams/me/pokemon/${pokemonId}`, { method: "PATCH", body: payload, auth: true, fallback: "Error al editar el set" });

// ── Blog (público) ────────────────────────────────────────────────────────────

export const getBlogPosts = () => request<BlogPostSummary[]>("/api/blog");
export const getBlogPost = (slug: string) => request<BlogPost>(`/api/blog/${encodeURIComponent(slug)}`);

// ── Administración ────────────────────────────────────────────────────────────

const admin = { auth: true } as const;

export const getPlayerAccounts = () => request<PlayerAccount[]>("/api/admin/players", admin);
export const addPlayerAccount = (payload: { email: string; username: string; is_admin: boolean; user_id?: string | null }) =>
  request<PlayerAccount>("/api/admin/players", { ...admin, method: "POST", body: payload, fallback: "Error al crear la cuenta" });
/**
 * Edita email/username/rol de una cuenta ya creada. Cambiar `email` desenlaza el
 * login (user_id -> NULL) salvo que se mande `link_user_id` a la vez (pegar un
 * login de Supabase a esta cuenta). Cambiar `username` mueve en cascada su roster,
 * bans y whitelist de la temporada — el resumen viene en la respuesta (`cascade`).
 */
export const updatePlayerAccount = (accountId: number, payload: {
  email?: string; username?: string; is_admin?: boolean; link_user_id?: string; clear_user_id?: boolean;
}) =>
  request<PlayerAccount & { cascade: UsernameRenameCascade; user_id_cleared: boolean }>(
    `/api/admin/players/${accountId}`, { ...admin, method: "PATCH", body: payload, fallback: "Error al editar la cuenta" });
export const deletePlayerAccount = (accountId: number) =>
  request(`/api/admin/players/${accountId}`, { ...admin, method: "DELETE", fallback: "Error al eliminar la cuenta" });

export const getAdminBlogPosts = () => request<AdminBlogPost[]>("/api/admin/blog", admin);
export const getAdminBlogPost = (id: number) => request<AdminBlogPost>(`/api/admin/blog/${id}`, admin);
export const createBlogPost = (payload: { title: string; content_md: string; publish: boolean }) =>
  request<AdminBlogPost>("/api/admin/blog", { ...admin, method: "POST", body: payload, fallback: "Error al subir la entrada" });
export const updateBlogPost = (id: number, payload: { title?: string; content_md?: string; is_published?: boolean }) =>
  request<AdminBlogPost>(`/api/admin/blog/${id}`, { ...admin, method: "PATCH", body: payload, fallback: "Error al guardar la entrada" });
export const deleteBlogPost = (id: number) =>
  request(`/api/admin/blog/${id}`, { ...admin, method: "DELETE", fallback: "Error al eliminar la entrada" });

/** Logins de Supabase Auth y si ya tienen cuenta en la liga. `available: false` en Postgres local. */
export const getAuthLogins = () => request<AuthLoginsResponse>("/api/admin/auth-logins", admin);

export const getBans = () => request<ActiveSeasonBansResponse>("/api/admin/bans", admin);

/** Fila de GET /api/admin/rosters — un equipo registrado en la temporada activa. */
export interface AdminRosterRow {
  username:      string;
  pokemon_count: number;
  changes_used:  number;
  is_locked:     boolean;
  has_lineup:    boolean;
  registered_at: string | null;
  validation:    RosterValidation;
}
export const getAdminRosters = () => request<AdminRosterRow[]>("/api/admin/rosters", admin);

/** Metadatos del snapshot importado en la base (tournament.dex_meta), público. */
export interface DexMeta {
  generated_at:  string | null;
  ps_commit:     string | null;
  species_count: number;
  imported_at:   string | null;
}
export const getDexMeta = () => request<DexMeta>("/api/dex/meta");

export const getBattles = () => request<BattleEntry[]>("/api/admin/battles", admin);
export const deleteBattle = (battleId: string) =>
  request<void>(`/api/admin/battles/${encodeURIComponent(battleId)}`, { ...admin, method: "DELETE", fallback: "Error al borrar la batalla" });
export const resetBattleData = () =>
  request<void>("/api/admin/reset-battles", { ...admin, method: "POST", fallback: "Error al limpiar la DB" });

export const getSeasons = () => request<SeasonEntry[]>("/api/admin/seasons", admin);
export const createSeason = (payload: {
  season_name: string; type_of_month: string; start_date: string;
  max_team_size?: number; max_team_changes?: number; restrictions?: SeasonRestrictions;
}) => request<SeasonEntry>("/api/admin/seasons", { ...admin, method: "POST", body: payload, fallback: "Error al crear temporada" });
export const updateSeason = (seasonId: number, payload: {
  season_name?: string; type_of_month?: string; start_date?: string; end_date?: string; clear_end_date?: boolean;
  is_active?: boolean; max_team_size?: number; max_team_changes?: number; restrictions?: SeasonRestrictions;
}) => request<SeasonEntry>(`/api/admin/seasons/${seasonId}`, { ...admin, method: "PATCH", body: payload, fallback: "Error al actualizar temporada" });
export const activateSeason = (seasonId: number) =>
  request<SeasonEntry>(`/api/admin/seasons/${seasonId}/activate`, { ...admin, method: "PATCH", fallback: "Error al activar temporada" });
export const closeSeason = (seasonId: number) =>
  request<SeasonEntry>(`/api/admin/seasons/${seasonId}/close`, { ...admin, method: "PATCH", fallback: "Error al cerrar temporada" });
export const deleteSeason = (seasonId: number) =>
  request<void>(`/api/admin/seasons/${seasonId}`, { ...admin, method: "DELETE", fallback: "Error al eliminar temporada" });

export const getSeasonBans = (seasonId: number) => request<SeasonBan[]>(`/api/admin/seasons/${seasonId}/bans`, admin);
export const addSeasonBan = (seasonId: number, payload: { player_username: string; pokemon_name: string }) =>
  request<SeasonBan>(`/api/admin/seasons/${seasonId}/bans`, { ...admin, method: "POST", body: payload, fallback: "Error al agregar ban" });
export const revokeSeasonBan = (seasonId: number, banId: number) =>
  request<void>(`/api/admin/seasons/${seasonId}/bans/${banId}`, { ...admin, method: "DELETE", fallback: "Error al revocar ban" });
export const getSeasonVotes = (seasonId: number) => request<VoteEntry[]>(`/api/admin/seasons/${seasonId}/votes`, admin);
export const getSeasonBanViolations = (seasonId: number) => request<BanViolation[]>(`/api/admin/seasons/${seasonId}/violations`, admin);
export const getSeasonTeamViolations = (seasonId: number) => request<TeamViolation[]>(`/api/admin/seasons/${seasonId}/team-violations`, admin);

export const getSeasonWhitelist = (seasonId: number) => request<WhitelistPlayer[]>(`/api/admin/seasons/${seasonId}/whitelist`, admin);
export const addSeasonWhitelist = (seasonId: number, username: string) =>
  request(`/api/admin/seasons/${seasonId}/whitelist`, { ...admin, method: "POST", body: { username }, fallback: "Error al agregar jugador" });
export const removeSeasonWhitelist = (seasonId: number, voterHash: string) =>
  request<void>(`/api/admin/seasons/${seasonId}/whitelist/${voterHash}`, { ...admin, method: "DELETE", fallback: "Error al eliminar jugador" });

/** Recalcula las temporadas de cada batalla y refresca las estadísticas. */
export const runMaintenance = () => request<MaintenanceResult>("/api/admin/etl/run", { ...admin, method: "POST", fallback: "Error al recalcular" });
export const getEtlFiles = () => request<EtlFileEntry[]>("/api/admin/etl/files", admin);
export const deleteEtlFiles = (filePaths: string[]) =>
  request<DeleteFilesResult>("/api/admin/etl/files", { ...admin, method: "DELETE", body: { file_paths: filePaths }, fallback: "Error al borrar" });

export const getLeagueSettings = () => request<LeagueSettings>("/api/admin/leaguesettings", admin);
export const updateLeagueSettings = (payload: {
  type_of_month?: string; max_team_size?: number; max_team_changes?: number; restrictions?: SeasonRestrictions;
}) => request<LeagueSettings>("/api/admin/leaguesettings", { ...admin, method: "PATCH", body: payload, fallback: "Error al guardar configuración" });
