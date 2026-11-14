import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CollectorsRanking } from "./CollectorsRanking";
import { buildCollection, collectionProgress } from "@/lib/dex/collection";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import type { CollectorEntry, PokedexSighting } from "@/lib/api";

type Q<T> = { data?: T; isPending?: boolean; isError?: boolean; error?: unknown; refetch: () => void };

const st = vi.hoisted(() => ({
  collectors: {} as Q<CollectorEntry[]>,
  dex: {} as Q<DexEssentials>,
}));

vi.mock("@/lib/queries", () => ({
  useCollectors: () => st.collectors,
  useDexEssentials: () => st.dex,
}));

function sp(id: string, name: string, num: number, extra: Partial<Species> = {}): Species {
  return {
    id, name, num, types: ["Bug"], bst: 500, baseStats: {}, color: "Red", eggGroups: [], gen: 2,
    tags: [], abilities: [], spriteid: id, baseSpecies: name, forme: null, prevo: null,
    isNonstandard: null, restricted: false, paradox: false, ultraBeast: false, pseudo: false, leagueLegal: true,
    ...extra,
  };
}

const SPECIES: Species[] = [
  sp("scyther", "Scyther", 123, { types: ["Bug", "Flying"], gen: 1 }),
  sp("scizor", "Scizor", 212, { types: ["Bug", "Steel"], prevo: "Scyther" }),
  sp("scizormega", "Scizor-Mega", 212, { types: ["Bug", "Steel"], baseSpecies: "Scizor", forme: "Mega" }),
  sp("pikachu", "Pikachu", 25, { types: ["Electric"], gen: 1 }),
  sp("garchomp", "Garchomp", 445, { types: ["Dragon", "Ground"], gen: 4 }),
];

const DEX: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: SPECIES.length, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: Object.fromEntries(SPECIES.map((s) => [s.id, s])),
  items: {},
};

const sighting = (species: string, at = "2026-11-10T00:00:00Z", opponent = "gary"): PokedexSighting => ({
  species_id: species.toLowerCase().replace(/[^a-z0-9]/g, ""),
  species,
  first_seen_at: at,
  battle_id: `b-${species}`,
  opponent,
});

const renderRanking = () =>
  render(
    <MemoryRouter>
      <CollectorsRanking />
    </MemoryRouter>,
  );

beforeEach(() => {
  st.dex = { isPending: false, isError: false, data: DEX, refetch: vi.fn() };
  st.collectors = { isPending: false, isError: false, data: [], refetch: vi.fn() };
});

describe("CollectorsRanking", () => {
  it("agrupa formas por número y cuenta preevoluciones igual que collectionProgress(buildCollection(dex, seen))", () => {
    const ashSeen = [
      sighting("Scizor", "2026-11-10T00:00:00Z"),
      sighting("Scizor-Mega", "2026-11-11T00:00:00Z"),
    ];
    const expected = collectionProgress(buildCollection(DEX, ashSeen));
    // Vió 2 filas del mismo número (#212 Scizor + Scizor-Mega), pero descubre #212 Scizor y #123 Scyther por preevolución => 2 de 4, seen = 1
    expect(expected.discovered).toBe(2);
    expect(expected.seen).toBe(1);
    expect(expected.total).toBe(4);

    // Agregamos una fila más del mismo número o comparamos con un caso donde seen.length !== discovered:
    // Si ve Scyther, Scizor y Scizor-Mega (3 filas en seen), discovered sigue siendo 2 (no 3).
    const threeRowsSeen = [
      sighting("Scyther", "2026-11-09T00:00:00Z"),
      ...ashSeen,
    ];
    const expectedThree = collectionProgress(buildCollection(DEX, threeRowsSeen));
    expect( threeRowsSeen ).toHaveLength(3);
    expect(expectedThree.discovered).toBe(2);

    st.collectors.data = [{ username: "ash", seen: ashSeen }];
    renderRanking();

    const link = screen.getByRole("link", { name: /ash/i });
    expect(link).toHaveTextContent(`${expected.discovered} / ${expected.total}`);
    expect(within(link).getByRole("meter")).toHaveAttribute("aria-valuenow", String(expected.discovered));
    expect(within(link).getByRole("meter")).toHaveAttribute("aria-valuemax", String(expected.total));
  });

  it("ordena por discovered descendente (con desempate por seen y username)", () => {
    st.collectors.data = [
      // pikachu -> 1 descubierta (seen: 1)
      { username: "brock", seen: [sighting("Pikachu")] },
      // scizor + scizormega + garchomp -> 3 descubiertas (#212, #123 prevo, #445)
      { username: "misty", seen: [sighting("Scizor"), sighting("Scizor-Mega"), sighting("Garchomp")] },
      // scizor -> 2 descubiertas (#212, #123 prevo)
      { username: "ash", seen: [sighting("Scizor")] },
    ];
    renderRanking();

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => within(li).getByRole("link").getAttribute("href"))).toEqual([
      "/j/misty/pokedex",
      "/j/ash/pokedex",
      "/j/brock/pokedex",
    ]);
  });

  it("cada fila enlaza a /j/<username>/pokedex", () => {
    st.collectors.data = [{ username: "ash", seen: [sighting("Pikachu")] }];
    renderRanking();

    const link = screen.getByRole("link", { name: /ash/i });
    expect(link).toHaveAttribute("href", "/j/ash/pokedex");
  });

  it("muestra la nota 'La Pokédex es por cuenta: no cambia con la temporada.'", () => {
    st.collectors.data = [{ username: "ash", seen: [sighting("Pikachu")] }];
    renderRanking();

    expect(screen.getByText("La Pokédex es por cuenta: no cambia con la temporada.")).toBeVisible();
  });

  it("con lista vacía muestra 'Nadie ha descubierto pokémon todavía'", () => {
    st.collectors.data = [];
    renderRanking();

    expect(screen.getByText("Nadie ha descubierto pokémon todavía")).toBeVisible();
  });

  it("muestra estado de carga mientras el dex o collectors cargan, y estado de error con reintento", () => {
    st.dex = { isPending: true, isError: false, data: undefined, refetch: vi.fn() };
    const { unmount } = renderRanking();
    expect(screen.getByRole("status")).toBeInTheDocument();
    unmount();

    const retry = vi.fn();
    st.dex = { isPending: false, isError: false, data: DEX, refetch: vi.fn() };
    st.collectors = { isPending: false, isError: true, error: new Error("Fallo de red"), refetch: retry };
    renderRanking();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    screen.getByRole("button", { name: "Reintentar" }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
