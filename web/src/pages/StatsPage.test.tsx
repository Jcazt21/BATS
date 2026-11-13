import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { StatsPage } from "./StatsPage";
import { abrirMenu, mockViewport } from "@/lib/test-utils";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; isSuccess?: boolean; isPlaceholderData?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({
  seasons: {} as Q, summary: {} as Q, leaderboard: {} as Q, mvp: {} as Q, pokemonStats: {} as Q, species: {} as Q, refreshing: false,
}));

vi.mock("@/lib/queries", () => ({
  useSeasons: () => st.seasons,
  useSummary: () => ({ ...st.summary, isPlaceholderData: st.refreshing }),
  useLeaderboard: () => st.leaderboard,
  useMvp: () => st.mvp,
  usePokemonStats: () => st.pokemonStats,
  useDexEssentials: () => st.species,
  useBattlesPerDay: () => ({ data: { days: [], last_7: 0, prev_7: 0 } }),
  useMe: () => ({ data: undefined }),
  useHeadToHead: () => ({ data: undefined, isPending: true }),
  useCollectors: () => ({ isPending: false, data: [{ username: "ash", seen: [] }] }),
}));

const fila = (species: string, pick: number) => ({
  species, used: 5, pick_pct: pick, brought: 6, bring_pct: pick + 10, win_rate_pct: 55, avg_mvp: 3.2, avg_kills: 1.5, survival_pct: 50,
});
const sp = (name: string, types: string[]) => ({ name, types });

const renderPage = () => render(<MemoryRouter><StatsPage /></MemoryRouter>);

beforeEach(() => {
  mockViewport(false);
  st.refreshing = false;
  st.seasons = { isSuccess: true, data: [
    { season_id: 3, season_name: "T3", is_active: true }, { season_id: 2, season_name: "T2", is_active: false },
  ] };
  st.summary = { isPending: false, data: { total_battles: 10, total_players: 4, avg_turns: 8, top_win_rate: 70 } };
  st.leaderboard = { isPending: false, data: [
    { username: "ash", total_battles: 5, wins: 4, losses: 1, ties: 0, win_rate_pct: 80, total_survivors: 9, form: ["L", "W", "W"], streak: { type: "W", length: 2 } },
    { username: "misty", total_battles: 5, wins: 2, losses: 2, ties: 1, win_rate_pct: 40, total_survivors: 5, form: ["W", "T"], streak: { type: "T", length: 1 } },
  ] };
  st.mvp = { isPending: false, data: [{ species: "Gengar", player: "ash", total_mvp_score: "12", total_kills: 5, avg_mvp_per_battle: "3" }] };
  st.pokemonStats = { isPending: false, data: { total_slots: 20, species: [fila("Dragonite", 40), fila("Gengar", 30), fila("Garchomp", 20)] } };
  st.species = { isSuccess: true, data: { species: {
    dragonite: sp("Dragonite", ["Dragon", "Flying"]), gengar: sp("Gengar", ["Ghost", "Poison"]), garchomp: sp("Garchomp", ["Dragon", "Ground"]),
  }, items: {}, meta: {} } };
});

describe("StatsPage · temporada", () => {
  it("el selector es un menú accesible, no un <select> nativo", () => {
    const { container } = renderPage();
    expect(container.querySelector("select")).toBeNull();
    expect(screen.getByRole("button", { name: /Temporada/ })).toHaveTextContent("T3");
  });

  it("al cambiar de temporada la página se atenúa (aria-busy) y al llegar los datos el contenido entra con fundido", async () => {
    const { container, rerender } = renderPage();
    const antes = container.querySelector("[data-stats-content]")!;
    st.refreshing = true;
    await abrirMenu(screen.getByRole("button", { name: /Temporada/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "T2" }));
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-stats-content]")).toBe(antes); // mientras llegan, se ve lo anterior

    st.refreshing = false;
    rerender(<MemoryRouter><StatsPage /></MemoryRouter>); // llegan los datos: la consulta ya no es placeholder
    const despues = container.querySelector("[data-stats-content]")!;
    expect(despues).not.toBe(antes);
    expect(despues).toHaveClass("animate-in", "fade-in-0");
  });
});

describe("StatsPage · bento", () => {
  it("arriba va el bento de la temporada en lugar de los StatTile", () => {
    renderPage();
    const bento = screen.getByRole("group", { name: "Resumen de la temporada" });
    expect(within(bento).getByRole("region", { name: "Pokémon más usado" })).toHaveTextContent("Dragonite");
    expect(within(bento).getByRole("region", { name: "MVP de la temporada" })).toHaveTextContent("Gengar");
  });
});

describe("StatsPage · tabs", () => {
  it("navega con Jugadores · Pokémon · Coleccionistas y solo monta el contenido de la activa", async () => {
    renderPage();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Jugadores", "Pokémon", "Coleccionistas"]);
    expect(screen.getByRole("list", { name: "Clasificación de jugadores" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Top de MVP" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Pokémon" }));
    expect(screen.getByRole("list", { name: "Top de MVP" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Clasificación de jugadores" })).not.toBeInTheDocument();
  });

  it("las pestañas miden ≥44px", () => {
    renderPage();
    expect(screen.getByRole("tablist")).toHaveClass("h-11");
  });
});

describe("StatsPage · Jugadores", () => {
  it("la clasificación muestra empates, forma y racha, y debajo el cara a cara", () => {
    mockViewport(true);
    renderPage();
    const tabla = screen.getByRole("table", { name: "Clasificación de jugadores" });
    expect(within(tabla).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(
      ["#", "Jugador", "Victorias", "Derrotas", "E", "Win rate", "Forma", "Racha", "Supervivientes"]);
    const misty = within(tabla).getByRole("row", { name: /misty/ });
    expect(within(misty).getByText("Empates:").parentElement).toHaveTextContent("1");
    expect(within(misty).getByText("1E")).toBeInTheDocument();
    expect(within(tabla).getByText("2V")).toBeInTheDocument();
    expect(within(tabla).getByRole("img", { name: "Forma: D, V, V" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cara a cara" })).toBeInTheDocument();
  });
});

describe("StatsPage · Coleccionistas", () => {
  it("la pestaña muestra el ranking y aclara que no depende de la temporada", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: "Coleccionistas" }));
    expect(screen.getByText("La Pokédex es por cuenta: no cambia con la temporada.")).toBeInTheDocument();
    const ranking = screen.getByRole("list", { name: "Ranking de coleccionistas" });
    expect(within(ranking).getByRole("link", { name: /ash/ })).toHaveAttribute("href", "/j/ash/pokedex");
  });
});

describe("StatsPage · móvil", () => {
  it("la tabla ofrece 'Ordenar por' y las tarjetas muestran posición y Meter", () => {
    renderPage();
    expect(screen.getByRole("radiogroup", { name: "Ordenar por" })).toBeInTheDocument();
    const tarjetas = screen.getByRole("list", { name: "Clasificación de jugadores" });
    const primera = within(tarjetas).getAllByRole("listitem")[0];
    expect(primera).toHaveTextContent(/Posición 1/);
    expect(within(primera).getByRole("meter")).toBeInTheDocument();
  });
});

describe("StatsPage · Uso", () => {
  it("muestra las columnas pick %, bring %, win rate, kills y MVP, filtra por tipo y cada fila enlaza a /stats/pokemon/{species}", async () => {
    mockViewport(true);
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: "Pokémon" }));
    await userEvent.click(screen.getByRole("radio", { name: "Lista" }));

    const tabla = screen.getByRole("table", { name: "Pokémon de la liga" });
    const cabeceras = within(tabla).getAllByRole("columnheader").map((th) => th.textContent);
    expect(cabeceras).toEqual(["Pokémon", "Pick rate", "Bring rate", "Win rate", "KOs", "MVP medio"]);

    const enlaces = within(tabla).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(enlaces).toContain("/stats/pokemon/Dragonite");
    expect(enlaces).toContain("/stats/pokemon/Gengar");
    expect(enlaces).toContain("/stats/pokemon/Garchomp");

    await userEvent.click(screen.getByRole("radio", { name: "Dragón" }));
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(2);
    expect(within(tabla).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/stats/pokemon/Dragonite",
      "/stats/pokemon/Garchomp",
    ]);
  });
});

describe("StatsPage · Uso · Gráfico / Lista", () => {
  it("por defecto muestra el gráfico; Lista cambia a la tabla", async () => {
    mockViewport(true);
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: "Pokémon" }));
    expect(screen.getByRole("figure", { name: "Gráfico de uso de los 10 pokémon más usados" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Pokémon de la liga" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Lista" }));
    expect(screen.getByRole("table", { name: "Pokémon de la liga" })).toBeInTheDocument();
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  });
});
