import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/lib/http";
import { PokemonStatsPage } from "./PokemonStatsPage";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({ entry: {} as Q, args: [] as unknown[][] }));
vi.mock("@/lib/queries", () => ({
  useActiveSeason: () => ({ data: { season_id: 1 } }),
  usePokemonStatsEntry: (...a: unknown[]) => { st.args.push(a); return st.entry; },
}));

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Mov${i + 1}`, count: n - i }));
const base = {
  species: "Dragonite", types: "Dragon / Flying", sprite_url: null, national_dex: 149, total_slots: 10, used: 5, pick_pct: 50,
  brought: 6, bring_pct: 60, win_rate_pct: 55, avg_kills: 1, avg_mvp: 3, survival_pct: 50, users: [],
};
const conSets = { ...base, sets: { players: 8, moves: items(8), items: items(3), abilities: [], natures: [], tera_types: [] } };
const sinSets = { ...base, sets: { players: 0, moves: [], items: [], abilities: [], natures: [], tera_types: [] } };

const renderPage = (url = "/stats/pokemon/Dragonite") => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/stats/pokemon/:species" element={<PokemonStatsPage />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => { st.args = []; st.entry = { isPending: false, data: conSets }; });

describe("PokemonStatsPage · bento y estilo del Inicio", () => {
  it("muestra 'Supervivencia' con el valor pct(survival_pct, 1) y su pista", () => {
    st.entry = { isPending: false, data: { ...conSets, survival_pct: 37.8 } };
    renderPage();
    const cell = screen.getByRole("region", { name: "Supervivencia" });
    expect(within(cell).getByText("37,8%")).toBeInTheDocument();
    expect(within(cell).getByText("terminó la batalla vivo")).toBeInTheDocument();
  });

  it("no renderiza la carta holográfica (ni HoloCard ni PokemonHolo)", () => {
    const { container } = renderPage();
    expect(container.querySelector(".holo-card, [data-holo-sprite]")).toBeNull();
  });

  it("muestra el aviso cuando bring_pct supera a pick_pct por más de 5 puntos", () => {
    renderPage();
    expect(screen.getByRole("note")).toHaveTextContent(/Se lleva más de lo que sale/);
  });

  it("404 muestra el estado vacío 'Ese pokémon aún no aparece en la liga'", () => {
    st.entry = { isPending: false, isError: true, error: new ApiError(404, "Not found") };
    renderPage();
    expect(screen.getByRole("heading", { name: "Ese pokémon aún no aparece en la liga" })).toBeInTheDocument();
  });
});

describe("PokemonStatsPage · sets", () => {
  it("sets aún privados: EmptyState que explica por qué", () => {
    st.entry = { isPending: false, data: sinSets };
    renderPage();
    expect(screen.getByRole("heading", { name: "Los sets aún son privados" })).toBeInTheDocument();
    expect(screen.getByText(/cuando el admin cierra el registro/)).toBeInTheDocument();
  });

  it("los rankings muestran 5 y el resto queda tras 'Ver más'", async () => {
    renderPage();
    const movs = screen.getByRole("heading", { name: "Movimientos" }).parentElement!;
    expect(within(movs).getByText("Mov5")).toBeVisible();
    expect(within(movs).queryByText("Mov6")).not.toBeInTheDocument();
    const ver = within(movs).getByRole("button", { name: /Ver más \(3\)/ });
    expect(ver).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(ver);
    expect(within(movs).getByText("Mov8")).toBeVisible();
    expect(within(movs).getByRole("button", { name: /Ver menos/ })).toBeInTheDocument();
  });

  it("un ranking de 5 o menos no ofrece 'Ver más'", () => {
    renderPage();
    const objetos = screen.getByRole("heading", { name: "Objetos" }).parentElement!;
    expect(within(objetos).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("PokemonStatsPage · temporada y volver", () => {
  it("por defecto usa la activa", () => {
    renderPage();
    expect(st.args.at(-1)).toEqual(["Dragonite", 1]);
  });

  it("?temporada=all pide todas y ?temporada=2 esa temporada (la ficha coincide con la lista de la que vienes)", () => {
    renderPage("/stats/pokemon/Dragonite?temporada=all");
    expect(st.args.at(-1)).toEqual(["Dragonite", undefined]);
    renderPage("/stats/pokemon/Dragonite?temporada=2");
    expect(st.args.at(-1)).toEqual(["Dragonite", 2]);
  });

  it("el enlace de vuelta apunta a /stats", () => {
    renderPage("/stats/pokemon/Dragonite");
    expect(screen.getByRole("link", { name: /Estadísticas/ })).toHaveAttribute("href", "/stats");
  });
});
