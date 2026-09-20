// En Docker: VITE_API_URL="" → llama a /api/* en el mismo dominio (nginx proxy)
// En dev local: VITE_API_URL="http://localhost:8001"
const BASE = import.meta.env.VITE_API_URL || "";

// ── Ban ───────────────────────────────────────────────────────────────────────

export async function checkUser(username: string) {
  const res = await fetch(`${BASE}/api/ban/check-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error("Error al verificar usuario");
  return res.json() as Promise<{ can_vote: boolean; reason: string | null }>;
}

export async function submitBan(payload: {
  username: string;
  pokemon_name: string;
  pokemon_types: string | null;
  sprite_url: string | null;
  national_dex: number | null;
}) {
  const res = await fetch(`${BASE}/api/ban/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al registrar ban");
  }
  return res.json();
}

// ── Admin ─────────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function adminLogin(password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error("Contraseña incorrecta.");
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export interface WhitelistPlayer {
  voter_hash: string;
  username: string;
  added_at: string | null;
  voted: boolean;
}

export async function getWhitelist(token: string): Promise<WhitelistPlayer[]> {
  const res = await fetch(`${BASE}/api/admin/whitelist`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("No autorizado");
  return res.json();
}

export async function addPlayer(token: string, username: string) {
  const res = await fetch(`${BASE}/api/admin/whitelist/add`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al agregar jugador");
  }
  return res.json();
}

export async function removePlayer(token: string, voter_hash: string) {
  const res = await fetch(`${BASE}/api/admin/whitelist/${voter_hash}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al eliminar jugador");
  }
  return res.json();
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

export async function getBans(token: string): Promise<ActiveSeasonBansResponse> {
  const res = await fetch(`${BASE}/api/admin/bans`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("No autorizado");
  return res.json();
}

export async function getSeasonWhitelist(token: string, seasonId: number): Promise<WhitelistPlayer[]> {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}/whitelist`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Error al cargar whitelist");
  return res.json();
}

export async function addSeasonWhitelist(token: string, seasonId: number, username: string) {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}/whitelist`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al agregar jugador");
  }
  return res.json();
}

export async function removeSeasonWhitelist(token: string, seasonId: number, voterHash: string) {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}/whitelist/${voterHash}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al eliminar jugador");
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

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

export async function getPublicSeasons(): Promise<PublicSeasonEntry[]> {
  const res = await fetch(`${BASE}/api/stats/seasons`);
  if (!res.ok) throw new Error("Error al cargar temporadas");
  return res.json();
}

export async function getLeagueSummary(seasonId?: number): Promise<LeagueSummary> {
  const qs = seasonId != null ? `?season_id=${seasonId}` : "";
  const res = await fetch(`${BASE}/api/stats/summary${qs}`);
  if (!res.ok) throw new Error("Error al cargar resumen");
  return res.json();
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
  total_battles: number;
  usage_pct:     number;
  win_rate_pct:  number;
}

// ── Bot Stats ─────────────────────────────────────────────────────────────────

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

export async function getBotSummary(): Promise<BotSummaryEntry[]> {
  const res = await fetch(`${BASE}/api/stats/bot/summary`);
  if (!res.ok) throw new Error("Error al cargar resumen bot");
  return res.json();
}

export async function getBotPokemon(): Promise<BotPokemonEntry[]> {
  const res = await fetch(`${BASE}/api/stats/bot/pokemon`);
  if (!res.ok) throw new Error("Error al cargar pokémon bot");
  return res.json();
}

export async function getBotBattles(): Promise<BotBattleEntry[]> {
  const res = await fetch(`${BASE}/api/stats/bot/battles`);
  if (!res.ok) throw new Error("Error al cargar batallas bot");
  return res.json();
}

export interface BattleDetailEntry {
  player: string;
  species: string;
  kills: number;
  survived: boolean;
  final_hit: boolean;
  mvp_score: string | number;
}

export async function getBotBattleDetails(battleId: string): Promise<BattleDetailEntry[]> {
  const res = await fetch(`${BASE}/api/stats/bot/battles/${battleId}`);
  if (!res.ok) throw new Error("Error al cargar detalles de la batalla");
  return res.json();
}

export async function getBattleDetails(battleId: string): Promise<BattleDetailEntry[]> {
  const res = await fetch(`${BASE}/api/stats/battles/${encodeURIComponent(battleId)}`);
  if (!res.ok) throw new Error("Error al cargar detalles de la batalla");
  return res.json();
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

export async function getBattles(token: string): Promise<BattleEntry[]> {
  const res = await fetch(`${BASE}/api/admin/battles`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("No autorizado");
  return res.json();
}

export async function deleteBattle(token: string, battleId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/battles/${encodeURIComponent(battleId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al borrar la batalla");
  }
}

export async function resetBattleData(token: string): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/reset-battles`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al limpiar la DB");
  }
}

export interface LeaderboardEntry {
  username:         string;
  total_battles:    number;
  wins:             number;
  losses:           number;
  win_rate_pct:     number;
  total_survivors:  number;
}

export async function getLeaderboard(seasonId?: number): Promise<LeaderboardEntry[]> {
  const qs = seasonId != null ? `?season_id=${seasonId}` : "";
  const res = await fetch(`${BASE}/api/stats/leaderboard${qs}`);
  if (!res.ok) throw new Error("Error al cargar leaderboard");
  return res.json();
}

export async function getMvpTop5(seasonId?: number): Promise<MvpEntry[]> {
  const qs = seasonId != null ? `?season_id=${seasonId}` : "";
  const res = await fetch(`${BASE}/api/stats/mvp${qs}`);
  if (!res.ok) throw new Error("Error al cargar MVPs");
  return res.json();
}

export async function getPickRate(seasonId?: number): Promise<PickRateEntry[]> {
  const qs = seasonId != null ? `?season_id=${seasonId}` : "";
  const res = await fetch(`${BASE}/api/stats/pickrate${qs}`);
  if (!res.ok) throw new Error("Error al cargar pick rate");
  return res.json();
}

// ── Seasons ───────────────────────────────────────────────────────────────────

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

export async function getSeasons(token: string): Promise<SeasonEntry[]> {
  const res = await fetch(`${BASE}/api/admin/seasons`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("No autorizado");
  return res.json();
}

export async function createSeason(
  token: string,
  payload: {
    season_name:       string;
    type_of_month:     string;
    start_date:        string;
    max_team_size?:    number;
    max_team_changes?: number;
    restrictions?:     SeasonRestrictions;
  },
): Promise<SeasonEntry> {
  const res = await fetch(`${BASE}/api/admin/seasons`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al crear temporada");
  }
  return res.json();
}

export async function activateSeason(token: string, seasonId: number): Promise<SeasonEntry> {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}/activate`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al activar temporada");
  }
  return res.json();
}

export async function closeSeason(token: string, seasonId: number): Promise<SeasonEntry> {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}/close`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al cerrar temporada");
  }
  return res.json();
}

export async function updateSeason(
  token: string,
  seasonId: number,
  payload: {
    season_name?:      string;
    type_of_month?:    string;
    start_date?:       string;
    end_date?:         string;
    clear_end_date?:   boolean;
    is_active?:        boolean;
    max_team_size?:    number;
    max_team_changes?: number;
    restrictions?:     SeasonRestrictions;
  },
): Promise<SeasonEntry> {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al actualizar temporada");
  }
  return res.json();
}

export async function deleteSeason(token: string, seasonId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al eliminar temporada");
  }
}

// ── Season Bans ───────────────────────────────────────────────────────────────

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

export async function getSeasonBans(token: string, seasonId: number): Promise<SeasonBan[]> {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}/bans`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Error al cargar bans");
  return res.json();
}

export async function addSeasonBan(
  token: string,
  seasonId: number,
  payload: { player_username: string; pokemon_name: string },
): Promise<SeasonBan> {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}/bans`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al agregar ban");
  }
  return res.json();
}

export async function revokeSeasonBan(token: string, seasonId: number, banId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}/bans/${banId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al revocar ban");
  }
}

export async function getSeasonVotes(token: string, seasonId: number): Promise<VoteEntry[]> {
  const res = await fetch(`${BASE}/api/admin/seasons/${seasonId}/votes`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Error al cargar votos");
  return res.json();
}

// ── ETL Cleaner ───────────────────────────────────────────────────────────────

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

export interface EtlRunResult {
  ok: boolean;
  etl:     { loaded: number; skipped: number; errors: number; total: number };
  seasons: { reset: number; updated: number; error: string | null };
}

export async function runEtl(token: string): Promise<EtlRunResult> {
  const res = await fetch(`${BASE}/api/admin/etl/run`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al ejecutar ETL");
  }
  return res.json();
}

export async function getEtlFiles(token: string): Promise<EtlFileEntry[]> {
  const res = await fetch(`${BASE}/api/admin/etl/files`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Error al cargar archivos ETL");
  return res.json();
}

export async function deleteEtlFiles(token: string, filePaths: string[]): Promise<DeleteFilesResult> {
  const res = await fetch(`${BASE}/api/admin/etl/files`, {
    method: "DELETE",
    headers: authHeaders(token),
    body: JSON.stringify({ file_paths: filePaths }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al borrar archivos");
  }
  return res.json();
}

// ── League Settings ───────────────────────────────────────────────────────────

/** All current restriction keys. Extend here when new rules are added. */
export interface SeasonRestrictions {
  required_color?:      string | null;   // PokeAPI color name or null = no restriction
  required_generation?: number | null;   // 1–9 or null = no restriction
  required_egg_group?:  string | null;   // PokeAPI egg group name or null = no restriction
  item_clause?:         boolean;         // default false
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

/** Static fallback — mirrors RESTRICTION_SPEC in leaguesettings.py */
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

export async function getLeagueSettings(token: string): Promise<LeagueSettings> {
  const res = await fetch(`${BASE}/api/admin/leaguesettings`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("No autorizado");
  return res.json();
}

export async function updateLeagueSettings(
  token: string,
  payload: {
    type_of_month?:    string;
    max_team_size?:    number;
    max_team_changes?: number;
    restrictions?:     SeasonRestrictions;
  },
): Promise<LeagueSettings> {
  const res = await fetch(`${BASE}/api/admin/leaguesettings`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al guardar configuración");
  }
  return res.json();
}

// ── Teams (public) ────────────────────────────────────────────────────────────

export interface ActiveSeasonInfo {
  season_id:        number;
  season_name:      string;
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
}

export interface BannedPokemon {
  pokemon_id: number;
  name:       string;
  types:      string | null;
  sprite_url: string | null;
}

export async function getPlayerBans(username: string): Promise<BannedPokemon[]> {
  const res = await fetch(`${BASE}/api/teams/banned/${encodeURIComponent(username.toLowerCase())}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getActiveSeason(): Promise<ActiveSeasonInfo> {
  const res = await fetch(`${BASE}/api/teams/active-season`);
  if (!res.ok) throw new Error("Error al cargar temporada activa");
  return res.json();
}

export async function getRoster(username: string): Promise<RosterInfo> {
  const res = await fetch(`${BASE}/api/teams/${encodeURIComponent(username.toLowerCase())}`);
  if (res.status === 404) throw new Error("not_found");
  if (res.status === 403) throw new Error("not_in_whitelist");
  if (!res.ok) throw new Error("Error al cargar equipo");
  return res.json();
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

export async function registerTeam(
  username: string,
  pokemon: PokemonPayload[],
): Promise<{ roster_id: number; username: string; season_id: number; pokemon_count: number }> {
  const res = await fetch(`${BASE}/api/teams/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, pokemon }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al registrar equipo");
  }
  return res.json();
}

export async function removePokemonFromRoster(
  username: string,
  pokemonId: number,
): Promise<{ ok: boolean }> {
  const res = await fetch(
    `${BASE}/api/teams/${encodeURIComponent(username.toLowerCase())}/pokemon/${pokemonId}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al eliminar pokémon");
  }
  return res.json();
}

export async function addPokemonToRoster(
  username: string,
  pokemon: PokemonPayload[],
): Promise<{ ok: boolean; added: number }> {
  const res = await fetch(
    `${BASE}/api/teams/${encodeURIComponent(username.toLowerCase())}/pokemon`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pokemon }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Error al agregar pokémon");
  }
  return res.json();
}
