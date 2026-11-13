import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { mockViewport } from "@/lib/test-utils";
import type { Species } from "@/lib/dex/snapshot";
import { PokedexPage } from "./PokedexPage";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({
  dex: {} as Q, me: {} as Q, pokedex: {} as Q, stats: {} as Q,
  session: { session: {} as unknown, loading: false },
  pokedexUser: undefined as string | undefined,
}));

vi.mock("@/lib/queries", () => ({
  useDexEssentials: () => st.dex,
  useMe: () => st.me,
  usePlayerPokedex: (u?: string) => { st.pokedexUser = u; return st.pokedex; },
  usePokemonStatsEntry: () => st.stats,
}));
vi.mock("@/lib/session", () => ({ useSession: () => st.session }));
vi.mock("@/components/SignInCard", () => ({ SignInCard: ({ title }: { title: string }) => <p>{title}</p> }));

function sp(id: string, name: string, num: number, extra: Partial<Species> = {}): Species {
  return {
    id, name, num, types: ["Fire"], bst: 300, baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    color: "Red", eggGroups: [], gen: 1, tags: [], abilities: ["Blaze"], spriteid: id, baseSpecies: name, forme: null,
    prevo: null, isNonstandard: null, restricted: false, paradox: false, ultraBeast: false, pseudo: false, leagueLegal: true,
    ...extra,
  };
}
const SPECIES = [
  sp("charmander", "Charmander", 4),
  sp("charmeleon", "Charmeleon", 5, { prevo: "Charmander" }),
  sp("charizard", "Charizard", 6, { prevo: "Charmeleon", types: ["Fire", "Flying"] }),
  sp("garchomp", "Garchomp", 445, { types: ["Dragon", "Ground"], gen: 4 }),
];
const seen = (species: string, at: string, opponent = "bea") => ({
  species_id: species.toLowerCase(), species, first_seen_at: at, battle_id: `b-${species}`, opponent,
});

function Ubicacion() {
  return <output data-testid="loc">{useLocation().pathname}</output>;
}
const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        {["/pokedex", "/pokedex/:species", "/j/:username/pokedex", "/j/:username/pokedex/:species"].map((path) => (
          <Route key={path} path={path} element={<PokedexPage />} />
        ))}
      </Routes>
      <Ubicacion />
    </MemoryRouter>,
  );
const grid = () => screen.getByRole("list", { name: "Casillas de la Pokédex" });

beforeEach(() => {
  mockViewport(true);
  st.session = { session: {}, loading: false };
  st.me = { isSuccess: true, data: { username: "jazar", email: "x", is_admin: false } };
  st.dex = { isSuccess: true, isPending: false, data: { species: Object.fromEntries(SPECIES.map((s) => [s.id, s])), items: {}, meta: {} } };
  st.pokedex = { isSuccess: true, data: { username: "jazar", seen: [
    seen("Garchomp", "2026-11-11T00:00:00Z", "ronny"), seen("Charizard", "2026-11-05T00:00:00Z"),
  ] } };
  st.stats = { isSuccess: true, isPending: false, data: { pick_pct: 35, win_rate_pct: 61.9, avg_mvp: 1.4 } };
});

describe("PokedexPage · grilla", () => {
  it("una casilla por número con su #NNN; las no descubiertas muestran ???", () => {
    st.pokedex = { isSuccess: true, data: { username: "jazar", seen: [] } };
    renderAt("/pokedex");
    const items = within(grid()).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(items[0]).getByText(`#${"004"}`)).toBeTruthy();
    expect(within(grid()).getAllByText("???")).toHaveLength(4);
  });

  it("las descubiertas muestran nombre e indicador de origen", () => {
    renderAt("/pokedex");
    expect(within(grid()).getByRole("button", { name: /Charizard/ })).toBeTruthy();
    expect(within(grid()).getAllByLabelText("Visto en batalla")).toHaveLength(2);
    expect(within(grid()).getAllByLabelText("Descubierto por evolución")).toHaveLength(2);
  });

  it("el anillo muestra descubiertos / total", () => {
    renderAt("/pokedex");
    expect(screen.getByRole("img", { name: "4 de 4 descubiertos" })).toBeTruthy();
  });

  it("la card muestra desglose, último descubierto y progreso por generación", () => {
    renderAt("/pokedex");
    const card = screen.getByRole("region", { name: "Progreso de la Pokédex" });
    expect(within(card).getByText("Vistos en batalla").nextSibling?.textContent).toBe("2");
    expect(within(card).getByText("Por evolución").nextSibling?.textContent).toBe("2");
    expect(within(card).getByText(/contra ronny/)).toBeTruthy();
    expect(within(card).getByText("3/3")).toBeTruthy();
    expect(within(card).getByText("1/1")).toBeTruthy();
  });

  it("el buscador no revela no descubiertos por nombre, pero sí por número", async () => {
    st.pokedex = { isSuccess: true, data: { username: "jazar", seen: [seen("Garchomp", "2026-11-11T00:00:00Z")] } };
    renderAt("/pokedex");
    const input = screen.getByRole("searchbox", { name: "Buscar en la Pokédex" });
    await userEvent.type(input, "charizard");
    expect(screen.queryByRole("list", { name: "Casillas de la Pokédex" })).toBeNull();
    expect(screen.getByText("Nada por aquí")).toBeTruthy();
    await userEvent.clear(input);
    await userEvent.type(input, "#006");
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(1);
    expect(within(grid()).getByText("???")).toBeTruthy();
  });

  it("sin sesión: grilla en siluetas y la invitación a iniciar sesión", () => {
    st.session = { session: null, loading: false };
    st.me = { isSuccess: false, data: undefined };
    st.pokedex = { isSuccess: false, data: undefined };
    renderAt("/pokedex");
    expect(screen.getByText("Inicia sesión para ver tu Pokédex")).toBeTruthy();
    expect(within(grid()).getAllByText("???")).toHaveLength(4);
  });

  it("perfil ajeno: pide la Pokédex de ese jugador y lo nombra en el título", () => {
    renderAt("/j/ronny/pokedex");
    expect(st.pokedexUser).toBe("ronny");
    expect(screen.getByRole("heading", { name: "Pokédex de ronny" })).toBeTruthy();
  });
});

describe("PokedexPage · ficha en modal", () => {
  it("abrir una casilla navega a /pokedex/<id> y muestra el modal; cerrar vuelve a /pokedex", async () => {
    renderAt("/pokedex");
    await userEvent.click(within(grid()).getByRole("button", { name: /Charizard/ }));
    expect(screen.getByTestId("loc").textContent).toBe("/pokedex/charizard");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Visto en batalla contra bea/)).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("loc").textContent).toBe("/pokedex");
  });

  it("entrar directo a la URL abre el modal sobre la grilla", () => {
    renderAt("/pokedex/charizard");
    expect(screen.getByRole("dialog")).toBeTruthy();
    // La grilla sigue montada debajo (inerte para lectores de pantalla mientras el modal está abierto).
    expect(screen.getByRole("list", { name: "Casillas de la Pokédex", hidden: true })).toBeTruthy();
  });

  it("por evolución muestra qué especie lo descubrió", () => {
    renderAt("/pokedex/charmander");
    expect(within(screen.getByRole("dialog")).getByText("Descubierto al ver a Charizard")).toBeTruthy();
  });

  it("muestra datos de la especie, el resumen del torneo y el link a las estadísticas", () => {
    renderAt("/pokedex/charizard");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Blaze")).toBeTruthy();
    expect(within(dialog).getByText("Velocidad")).toBeTruthy();
    expect(within(dialog).getByText("61,9%")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Ver estadísticas completas" }).getAttribute("href")).toBe("/stats/pokemon/Charizard");
  });

  it("una casilla sin descubrir no se abre, ni por URL", () => {
    st.pokedex = { isSuccess: true, data: { username: "jazar", seen: [seen("Garchomp", "2026-11-11T00:00:00Z")] } };
    renderAt("/pokedex/charizard");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("loc").textContent).toBe("/pokedex");
    expect(within(grid()).queryByRole("button", { name: /Charizard/ })).toBeNull();
  });
});
