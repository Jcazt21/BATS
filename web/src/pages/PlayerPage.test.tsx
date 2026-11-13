import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PlayerPage } from "./PlayerPage";
import { abrirMenu } from "@/lib/test-utils";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({ profile: {} as Q, seasons: {} as Q, args: [] as unknown[][], detail: {} as Q }));

vi.mock("@/lib/queries", () => ({
  useActiveSeason: () => ({ data: { season_id: 3, season_name: "T3" } }),
  useSeasons: () => st.seasons,
  usePlayerProfile: (...a: unknown[]) => { st.args.push(a); return st.profile; },
  useBattleDetails: () => st.detail,
}));
vi.mock("@/components/app/ResponsiveSheet", () => ({
  ResponsiveSheet: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));
vi.mock("@/components/app/BattleDetail", () => ({
  BattleDetail: ({ players, winner }: { players: string[]; winner: string | null }) => <p>detalle {players.join(" vs ")} gana {winner}</p>,
}));

const perfil = {
  username: "ash", first_seen: null, last_seen: null,
  record: { battles: 5, wins: 3, losses: 2, ties: 0, win_rate_pct: 60, forfeits: 0, survivors: 8 },
  mvp: { total: 10, kills: 7 }, streak: { type: "win", length: 3 }, top_pokemon: [],
  recent: [{ battle_id: "b1", date: "2026-10-01", opponent: "misty", won: true, turns: 12, end_type: "normal" }],
  roster: null,
};

function Ubicacion() {
  return <output data-testid="loc">{useLocation().pathname}</output>;
}
const renderPage = (entries = ["/j/ash"], index = 0) => render(
  <MemoryRouter initialEntries={entries} initialIndex={index}>
    <Routes><Route path="/j/:username" element={<PlayerPage />} /><Route path="*" element={<p>otra</p>} /></Routes>
    <Ubicacion />
  </MemoryRouter>,
);

beforeEach(() => {
  st.args = [];
  st.profile = { isPending: false, data: perfil };
  st.detail = { isPending: false, data: [] };
  st.seasons = { isSuccess: true, data: [{ season_id: 3, season_name: "T3", is_active: true }, { season_id: 2, season_name: "T2", is_active: false }] };
});

describe("PlayerPage", () => {
  it("el récord muestra los empates aparte solo cuando los hay", () => {
    const { unmount } = renderPage();
    expect(screen.getByText("3–2")).toBeInTheDocument();
    unmount();
    st.profile = { isPending: false, data: { ...perfil, record: { ...perfil.record, battles: 6, ties: 1 } } };
    renderPage();
    expect(screen.getByText("3–2–1")).toBeInTheDocument();
  });

  it("el encabezado está alineado a la grilla: es hijo directo de la página, no está anidado en un flex", () => {
    const { container } = renderPage();
    const pagina = container.firstElementChild!;
    expect(screen.getByRole("banner").parentElement).toBe(pagina);
  });

  it("volver regresa a la página previa y, entrando directo, a /stats", async () => {
    renderPage(["/stats/pokemon/Gengar", "/j/ash"], 1);
    await userEvent.click(screen.getByRole("link", { name: /Estadísticas/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/stats/pokemon/Gengar");
  });

  it("selector de temporada: por defecto la activa; elegir otra o 'Todas' repite la consulta", async () => {
    renderPage();
    expect(st.args.at(-1)).toEqual(["ash", 3]);
    await abrirMenu(screen.getByRole("button", { name: /Temporada/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "T2" }));
    expect(st.args.at(-1)).toEqual(["ash", 2]);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await abrirMenu(screen.getByRole("button", { name: /Temporada/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Todas las temporadas" }));
    expect(st.args.at(-1)).toEqual(["ash", undefined]);
  });

  it("las batallas recientes se abren en el detalle (BattleDetail)", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /vs misty/ }));
    const dialogo = await screen.findByRole("dialog", { name: "ash vs misty" });
    expect(within(dialogo).getByText(/detalle ash vs misty gana ash/)).toBeInTheDocument();
  });

  it("enlaza a la Pokédex pública del jugador", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /Ver Pokédex/ }).getAttribute("href")).toBe("/j/ash/pokedex");
  });
});
