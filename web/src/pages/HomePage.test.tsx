import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import { ApiError } from "@/lib/http";
import { leerFuente } from "@/styles/source";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({
  session: null as unknown,
  sessionLoading: false,
  season: {} as Q, summary: {} as Q, leaderboard: {} as Q, mvp: {} as Q, ban: {} as Q, recent: {} as Q, perDay: {} as Q, dex: {} as Q,
  me: {} as Q, profile: {} as Q, roster: {} as Q, elig: {} as Q,
}));

vi.mock("@/lib/session", () => ({ useSession: () => ({ session: st.session, loading: st.sessionLoading }) }));
vi.mock("@/lib/queries", () => ({
  useActiveSeason: () => st.season, useSummary: () => st.summary, useLeaderboard: () => st.leaderboard,
  useMvp: () => st.mvp, useBanStatus: () => st.ban, useRecentBattles: () => st.recent, useBattlesPerDay: () => st.perDay, useDexEssentials: () => st.dex, useDexDetails: () => ({ data: undefined }),
  useMe: () => st.me, usePlayerProfile: () => st.profile, useRoster: () => st.roster, useEligibility: () => st.elig,
  // Selector de sprite del carnet: montado pero cerrado, solo necesita que los hooks existan.
  useTrainers: () => ({ isPending: false, isError: false, data: [] }), useUpdateAvatar: () => ({ mutate: () => {}, isPending: false, isError: false }),
}));

const mon = (id: number, name: string, types: string, extra = {}) => ({
  pokemon_id: id, name, types, sprite_url: null, held_item: null, ability: null, nature: null, tera_type: null,
  moves: [], evs: {}, ivs: {}, added_at: null, in_lineup: true, ...extra,
});

const renderPage = () => render(<MemoryRouter><HomePage /></MemoryRouter>);

beforeEach(() => {
  st.session = null;
  st.sessionLoading = false;
  st.season = { isPending: false, data: { season_id: 1, season_name: "Temporada 1", type_of_month: "ice", max_team_size: 8, max_team_changes: 3, restrictions: {} } };
  st.summary = { isPending: false, data: { total_battles: 12, total_players: 5, avg_turns: 9.5, top_win_rate: 80 } };
  st.leaderboard = { isPending: false, data: [
    { username: "kronos", total_battles: 6, wins: 5, losses: 1, win_rate_pct: 83 },
    { username: "ash", total_battles: 4, wins: 3, losses: 1, win_rate_pct: 75 },
  ] };
  st.mvp = { isPending: false, data: [{ species: "Gengar", player: "ash", total_kills: 4, total_mvp_score: "12" }], refetch: () => {} };
  st.ban = { isPending: false, data: { total_authorized: 8, total_voted: 3, total_votes_cast: 3, voting_open: true } };
  st.perDay = { isPending: false, data: { days: [{ date: "2026-04-05", battles: 1, total: 11 }, { date: "2026-04-06", battles: 1, total: 12 }], last_7: 2, prev_7: 1 } };
  st.recent = { isPending: false, data: [{ battle_id: "b1", date: null, winner: "ash", loser: "kronos", players: ["ash", "kronos"], turns: 17, end_type: "normal" }], refetch: () => {} };
  const sp = (id: string, num: number, types: string[]) => ({
    id, name: id, num, types, bst: 500, baseStats: {}, color: "Blue", eggGroups: [], gen: 1, tags: [], abilities: [],
    spriteid: id, leagueLegal: true,
  });
  st.dex = { data: { species: { gengar: sp("gengar", 94, ["Ghost", "Poison"]), baxcalibur: sp("baxcalibur", 998, ["Dragon", "Ice"]) }, items: {} } };
  st.me = { data: { username: "ash" } };
  st.profile = { data: {
    username: "ash", record: { battles: 4, wins: 3, losses: 1, win_rate_pct: 75, forfeits: 0, survivors: 5 },
    mvp: { total: 12, kills: 4 }, streak: { type: "win", length: 3 },
    badges: [
      { id: "first_win", glyph: "★", label: "Primera victoria", earned: true },
      { id: "streak_5", glyph: "5×", label: "Racha de 5 victorias", earned: false },
    ],
  } };
  st.roster = { isPending: false, data: {
    pool: [mon(1, "Gengar", "Ghost / Poison"), mon(2, "Baxcalibur", "Dragon / Ice")], max_team_size: 8, lineup_set: false,
    rotations_remaining: 2, max_rotations: 3, validation: { state: "ok", errors: [] },
  } };
  st.elig = { isPending: false, data: { can_vote: true } };
});

describe("HomePage · sin sesión", () => {
  it("invita a entrar y no muestra carnet ni equipo", () => {
    renderPage();
    const tarjeta = screen.getByRole("region", { name: "Tu estado" });
    expect(within(tarjeta).getByRole("link", { name: /Entrar/ })).toHaveAttribute("href", "/equipo");
    expect(screen.queryByRole("region", { name: "Tu carnet" })).not.toBeInTheDocument();
  });

  it("la liga sigue visible: resumen, tipo del mes, MVP y actividad", () => {
    renderPage();
    expect(screen.getByRole("region", { name: "Batallas" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tipo del mes" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "MVP" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Actividad" })).toHaveTextContent("ash");
  });

  it("mientras se resuelve la sesión no parpadea el estado de invitado", () => {
    st.sessionLoading = true;
    renderPage();
    expect(screen.queryByRole("link", { name: /Entrar/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });
});

describe("HomePage · con sesión", () => {
  beforeEach(() => { st.session = { token: "t" }; });

  it("carnet con récord, puesto, racha e insignias del servidor", () => {
    renderPage();
    const carnet = screen.getByRole("region", { name: "Tu carnet" });
    expect(carnet).toHaveTextContent("ash");
    expect(carnet).toHaveTextContent("#2 de 2");
    expect(carnet).toHaveTextContent("Racha V3");
    expect(within(carnet).getByRole("img", { name: "Primera victoria" })).toBeInTheDocument();
    expect(within(carnet).getByRole("img", { name: "Racha de 5 victorias (bloqueada)" })).toBeInTheDocument();
  });

  it("el equipo muestra cada pokémon con sus tipos", () => {
    renderPage();
    const equipo = screen.getByRole("region", { name: "Tu equipo" });
    expect(equipo).toHaveTextContent("Gengar");
    expect(equipo).toHaveTextContent("Fantasma");
    expect(equipo).toHaveTextContent("Dragón");
    expect(within(equipo).queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("sin equipo registrado lo dice y lleva a registrarlo", () => {
    st.roster = { isPending: false, isError: true, error: new ApiError(404, "sin equipo") };
    renderPage();
    expect(screen.getByText("Aún no registras tu equipo", { selector: "h3" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Registrar/ })[0]).toHaveAttribute("href", "/equipo");
    expect(screen.queryByRole("region", { name: "Tu equipo" })).not.toBeInTheDocument();
  });

  it("mientras carga el equipo muestra un esqueleto del mismo tamaño", () => {
    st.roster = { isPending: true };
    renderPage();
    expect(screen.queryByRole("region", { name: "Tu equipo" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tu carnet" })).toBeInTheDocument();
  });
});

describe("HomePage · listas", () => {
  it("resumen: curva de batallas, jugadores y barras de win rate", () => {
    renderPage();
    expect(within(screen.getByRole("region", { name: "Jugadores" })).getByRole("link")).toHaveAttribute("href", "/stats");
    const batallas = screen.getByRole("region", { name: "Batallas" });
    expect(batallas).toHaveTextContent("12");
    expect(batallas).toHaveTextContent("+100%");
    expect(within(batallas).getByRole("img", { name: /^Batallas acumuladas:/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Win rate por jugador:/ })).toBeInTheDocument();
  });

  it("sin batallas la tarjeta de la curva lo dice", () => {
    st.perDay = { isPending: false, data: { days: [], last_7: 0, prev_7: 0 } };
    renderPage();
    expect(within(screen.getByRole("region", { name: "Batallas" })).getByText("Aún no hay batallas.")).toBeInTheDocument();
  });

  it("MVP y actividad vacíos muestran un EmptyState", () => {
    st.mvp = { isPending: false, data: [], refetch: () => {} };
    st.recent = { isPending: false, data: [], refetch: () => {} };
    renderPage();
    expect(screen.getByText("Aún no hay MVP")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay batallas")).toBeInTheDocument();
  });

  it("cargando muestran esqueleto (role=status), no un vacío falso", () => {
    st.mvp = { isPending: true, refetch: () => {} };
    st.recent = { isPending: true, refetch: () => {} };
    renderPage();
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.queryByText("Aún no hay MVP")).not.toBeInTheDocument();
  });

  it("un error en actividad no tumba el resto y permite reintentar", () => {
    const refetch = vi.fn();
    st.recent = { isPending: false, isError: true, error: new Error("boom"), refetch };
    renderPage();
    expect(within(screen.getByRole("region", { name: "Actividad" })).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "MVP" })).toHaveTextContent("Gengar");
  });

  it("las filas enlazadas tienen foco visible", () => {
    renderPage();
    const fila = screen.getByRole("link", { name: /Gengar/ });
    expect(fila.className).toMatch(/focus-visible:/);
  });
});

describe("HomePage · guardas de fuente", () => {
  it("el movimiento en hover solo aplica con puntero fino", () => {
    // El abanico reacciona al puntero por JS: el táctil no cuenta como hover.
    const src = leerFuente("components/home/CardFan.tsx");
    expect(src).toMatch(/pointerType === "touch"/);
  });

  it("la Home solo se ensancha en escritorio", () => {
    const src = leerFuente("pages/HomePage.tsx");
    const clases = src.match(/const WIDE_ROW = "([^"]+)"/)?.[1] ?? "";
    expect(clases).not.toBe("");
    for (const c of clases.split(" ")) expect(c, c).toMatch(/^lg:/);
    expect(src).toMatch(/className=\{`flex flex-col gap-10 \$\{WIDE_ROW\}`\}/);
  });

  it("las secciones comparten gap-10", () => {
    const src = leerFuente("pages/HomePage.tsx");
    expect(src).not.toMatch(/\bgap-8\b/);
    expect(src).toMatch(/flex flex-col gap-10/);
  });

  it("las tarjetas grandes usan el radio único del token", () => {
    for (const f of ["components/home/TrainerCard.tsx", "components/home/GuestHero.tsx"]) {
      expect(leerFuente(f), f).toMatch(/rounded-\[var\(--radius-card\)\]/);
    }
  });
});
