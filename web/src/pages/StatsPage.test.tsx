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
    { username: "ash", total_battles: 5, wins: 4, losses: 1, win_rate_pct: 80, total_survivors: 9 },
    { username: "misty", total_battles: 5, wins: 2, losses: 3, win_rate_pct: 40, total_survivors: 5 },
  ] };
  st.mvp = { isPending: false, data: [{ species: "Gengar", player: "ash", total_mvp_score: "12", total_kills: 5, avg_mvp_per_battle: "3" }] };
  st.pokemonStats = { isPending: false, data: { total_slots: 20, species: [fila("Dragonite", 40), fila("Gengar", 30), fila("Garchomp", 20)] } };
  st.species = { isSuccess: true, data: { species: {
    dragonite: sp("Dragonite", ["Dragon", "Flying"]), gengar: sp("Gengar", ["Ghost", "Poison"]), garchomp: sp("Garchomp", ["Dragon", "Ground"]),
  }, items: {}, meta: {} } };
});

describe("StatsPage · temporada", () => {
  it("el selector es un menú accesible, no un <select> nativo", () => {
    renderPage();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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

describe("StatsPage · tabs", () => {
  it("navega con Tabla · MVP · Uso y solo monta el contenido de la activa", async () => {
    renderPage();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Tabla", "MVP", "Uso"]);
    expect(screen.getByRole("list", { name: "Clasificación de jugadores" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Top de MVP" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "MVP" }));
    expect(screen.getByRole("list", { name: "Top de MVP" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Clasificación de jugadores" })).not.toBeInTheDocument();
  });

  it("las pestañas miden ≥44px", () => {
    renderPage();
    expect(screen.getByRole("tablist")).toHaveClass("h-11");
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
    await userEvent.click(screen.getByRole("tab", { name: "Uso" }));
    await userEvent.click(screen.getByRole("radio", { name: "Lista" }));

    const tabla = screen.getByRole("table");
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
    await userEvent.click(screen.getByRole("tab", { name: "Uso" }));
    expect(screen.getByRole("figure", { name: "Gráfico de uso de los 10 pokémon más usados" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Lista" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  });
});
