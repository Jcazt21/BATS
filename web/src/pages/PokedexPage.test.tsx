import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { mockViewport } from "@/lib/test-utils";
import { PokedexPage } from "./PokedexPage";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({ seasons: {} as Q, dex: {} as Q, species: {} as Q, lastSeason: undefined as unknown }));

vi.mock("@/lib/queries", () => ({
  useSeasons: () => st.seasons,
  usePokedex: (s: unknown) => { st.lastSeason = s; return st.dex; },
  useDexEssentials: () => st.species,
}));

const fila = (species: string, pick: number) => ({ species, used: 5, pick_pct: pick, brought: 6, bring_pct: pick, win_rate_pct: 50, avg_mvp: 3, avg_kills: 1 });
const sp = (name: string, types: string[]) => ({ name, types });

function Ubicacion() {
  return <output data-testid="loc">{useLocation().search}</output>;
}
const renderPage = (url = "/pokedex") =>
  render(<MemoryRouter initialEntries={[url]}><PokedexPage /><Ubicacion /></MemoryRouter>);
const nombresEnTabla = () =>
  within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);

beforeEach(() => {
  mockViewport(true);
  st.seasons = { isSuccess: true, data: [
    { season_id: 3, season_name: "T3", is_active: true }, { season_id: 2, season_name: "T2", is_active: false },
  ] };
  st.dex = { isPending: false, data: { total_slots: 20, species: [fila("Dragonite", 40), fila("Gengar", 30), fila("Garchomp", 20)] } };
  st.species = { isSuccess: true, data: { species: {
    dragonite: sp("Dragonite", ["Dragon", "Flying"]), gengar: sp("Gengar", ["Ghost", "Poison"]), garchomp: sp("Garchomp", ["Dragon", "Ground"]),
  }, items: {}, meta: {} } };
});

describe("PokedexPage · filtro por tipo", () => {
  it("sin filtro muestra todos", () => {
    renderPage();
    expect(nombresEnTabla()).toHaveLength(3);
  });

  it("elegir un tipo reduce las filas a los pokémon de ese tipo", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("radio", { name: "Dragón" }));
    expect(nombresEnTabla().join()).toMatch(/Dragonite.*Garchomp|Garchomp.*Dragonite/);
    expect(nombresEnTabla()).toHaveLength(2);
  });

  it("el filtro se guarda en la URL (?tipo=)", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("radio", { name: "Fantasma" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("tipo=ghost");
  });

  it("al abrir una URL con ?tipo= el filtro ya está aplicado", () => {
    renderPage("/pokedex?tipo=ghost");
    expect(screen.getByRole("radio", { name: "Fantasma" })).toBeChecked();
    expect(nombresEnTabla()).toHaveLength(1);
  });

  it("'Todos' quita el filtro de la URL", async () => {
    renderPage("/pokedex?tipo=ghost");
    await userEvent.click(screen.getByRole("radio", { name: "Todos" }));
    expect(screen.getByTestId("loc")).not.toHaveTextContent("tipo=");
  });

  it("un tipo sin resultados explica por qué la lista está vacía", async () => {
    renderPage("/pokedex?tipo=ice");
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
  });
});

describe("PokedexPage · temporada", () => {
  it("hay un selector de temporada y por defecto usa la activa", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Temporada/ })).toHaveTextContent("T3");
    expect(st.lastSeason).toBe(3);
  });

  it("?temporada=2 pide esa temporada", () => {
    renderPage("/pokedex?temporada=2");
    expect(st.lastSeason).toBe(2);
  });
});

describe("PokedexPage · filas y definiciones", () => {
  it("el nombre de cada pokémon es un enlace real a su ficha", () => {
    renderPage();
    const enlaces = within(screen.getByRole("table")).getAllByRole("link");
    expect(enlaces.map((a) => a.getAttribute("href"))).toContain("/pokedex/Dragonite");
  });

  it("las tarjetas móviles muestran el Meter del pick rate", () => {
    mockViewport(false);
    renderPage();
    const tarjetas = screen.getByRole("list", { name: "Pokémon de la liga" });
    expect(within(tarjetas).getAllByRole("meter").length).toBeGreaterThan(0);
  });

  it("pick y bring rate se explican en un disclosure, no en una nota al pie", async () => {
    renderPage();
    const boton = screen.getByRole("button", { name: /Qué significan/ });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/porcentaje de equipos en los que el pokémon salió al campo/)).not.toBeInTheDocument();
    await userEvent.click(boton);
    expect(screen.getByText(/porcentaje de equipos en los que el pokémon salió al campo/)).toBeVisible();
  });

  it("los enlaces a la ficha conservan la temporada elegida", () => {
    renderPage("/pokedex?temporada=all");
    const enlaces = within(screen.getByRole("table")).getAllByRole("link");
    expect(enlaces.map((a) => a.getAttribute("href"))).toContain("/pokedex/Dragonite?temporada=all");
  });
});
