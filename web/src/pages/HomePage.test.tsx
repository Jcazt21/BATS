import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import { ApiError } from "@/lib/http";
import { leerFuente } from "@/styles/source";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({
  session: null as unknown,
  season: {} as Q, summary: {} as Q, leaderboard: {} as Q, mvp: {} as Q, ban: {} as Q,
  me: {} as Q, roster: {} as Q, elig: {} as Q,
}));

vi.mock("@/lib/session", () => ({ useSession: () => ({ session: st.session, loading: false }) }));
vi.mock("@/lib/queries", () => ({
  useActiveSeason: () => st.season, useSummary: () => st.summary, useLeaderboard: () => st.leaderboard,
  useMvp: () => st.mvp, useBanStatus: () => st.ban, useMe: () => st.me, useRoster: () => st.roster, useEligibility: () => st.elig,
}));

const renderPage = () => render(<MemoryRouter><HomePage /></MemoryRouter>);

beforeEach(() => {
  st.session = null;
  st.season = { data: { season_id: 1, season_name: "T1", type_of_month: "ice", restrictions: {} } };
  st.summary = { isPending: false, data: { total_battles: 12, total_players: 5, avg_turns: 9.5, top_win_rate: 80 } };
  st.leaderboard = { isPending: false, data: [{ username: "ash", total_battles: 4, wins: 3, losses: 1, win_rate_pct: 75 }] };
  st.mvp = { isPending: false, data: [{ species: "Gengar", player: "ash", total_kills: 4, total_mvp_score: "12" }] };
  st.ban = { isPending: false, data: { total_authorized: 8, total_voted: 3, total_votes_cast: 3, voting_open: true } };
  st.me = { data: { username: "ash" } };
  st.roster = { isPending: false, data: { pool: [1, 2, 3, 4, 5, 6], max_team_size: 8, validation: { state: "ok", errors: [] } } };
  st.elig = { isPending: false, data: { can_vote: true } };
});

describe("HomePage · hero", () => {
  it("el tipo del mes está en el hero, antes de la clasificación", () => {
    renderPage();
    const hero = screen.getByRole("banner");
    expect(within(hero).getByText("Hielo")).toBeInTheDocument();
    const clasificacion = screen.getByRole("heading", { name: "Clasificación" });
    expect(hero.compareDocumentPosition(clasificacion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no hay subtítulo genérico", () => {
    renderPage();
    expect(screen.queryByText(/Estadísticas de la liga, tu equipo y la fase de bans/)).not.toBeInTheDocument();
  });

  it("los mosaicos de resumen son enlaces a las estadísticas", () => {
    renderPage();
    const resumen = screen.getByRole("region", { name: "Resumen" });
    expect(within(resumen).getAllByRole("link")).toHaveLength(4);
    expect(within(resumen).getByRole("link", { name: /Batallas/ })).toHaveAttribute("href", "/stats");
  });
});

describe("HomePage · tarjeta personal", () => {
  it("sin sesión invita a entrar", () => {
    renderPage();
    const tarjeta = screen.getByRole("region", { name: "Tu estado" });
    expect(within(tarjeta).getByRole("link", { name: /Entrar/ })).toHaveAttribute("href", "/equipo");
  });

  it("con sesión muestra récord, estado del equipo y ban abierto", () => {
    st.session = { token: "t" };
    renderPage();
    const tarjeta = screen.getByRole("region", { name: "Tu estado" });
    expect(tarjeta).toHaveTextContent("3 V · 1 D");
    expect(tarjeta).toHaveTextContent("6/8 pokémon");
    expect(tarjeta).toHaveTextContent("Válido");
    expect(tarjeta).toHaveTextContent("Tienes un voto pendiente");
  });

  it("sin equipo registrado lo dice y lleva a registrarlo", () => {
    st.session = { token: "t" };
    st.roster = { isPending: false, isError: true, error: new ApiError(404, "sin equipo") };
    renderPage();
    const tarjeta = screen.getByRole("region", { name: "Tu estado" });
    expect(tarjeta).toHaveTextContent("Aún no registras tu equipo");
    expect(within(tarjeta).getByRole("link", { name: /Registrar/ })).toHaveAttribute("href", "/equipo");
  });

  it("si ya votaste lo dice", () => {
    st.session = { token: "t" };
    st.elig = { isPending: false, data: { can_vote: false, reason: "already_voted" } };
    renderPage();
    expect(screen.getByRole("region", { name: "Tu estado" })).toHaveTextContent("Ya votaste");
  });

  it("mientras carga muestra esqueleto", () => {
    st.session = { token: "t" };
    st.roster = { isPending: true };
    renderPage();
    expect(within(screen.getByRole("region", { name: "Tu estado" })).getByRole("status")).toBeInTheDocument();
  });
});

describe("HomePage · listas", () => {
  it("clasificación y MVP vacíos muestran un EmptyState", () => {
    st.leaderboard = { isPending: false, data: [] };
    st.mvp = { isPending: false, data: [] };
    renderPage();
    expect(screen.getByText("Aún no hay clasificación")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay MVP")).toBeInTheDocument();
  });

  it("cargando muestran esqueleto (role=status), no un vacío falso", () => {
    st.leaderboard = { isPending: true };
    st.mvp = { isPending: true };
    renderPage();
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.queryByText("Aún no hay clasificación")).not.toBeInTheDocument();
  });

  it("las filas enlazadas tienen foco visible", () => {
    renderPage();
    const fila = screen.getByRole("link", { name: /ash.*3 V/ });
    expect(fila.className).toMatch(/focus-visible:/);
  });
});

describe("HomePage · guardas de fuente", () => {
  it("el movimiento en hover solo aplica con puntero fino", () => {
    const src = leerFuente("pages/HomePage.tsx");
    expect(src).not.toMatch(/(?<!\)\]:)group-hover:translate/);
    expect(src).toMatch(/\[@media\(hover:hover\)_and_\(pointer:fine\)\]:group-hover:translate-x-0\.5/);
  });

  it("las secciones comparten gap-8", () => {
    const src = leerFuente("pages/HomePage.tsx");
    expect(src).not.toMatch(/\bgap-10\b/);
    expect(src).toMatch(/flex flex-col gap-8/);
  });
});
