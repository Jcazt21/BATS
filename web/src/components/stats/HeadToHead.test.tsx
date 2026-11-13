import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HeadToHead } from "./HeadToHead";
import type { HeadToHead as H2H, LeaderboardEntry } from "@/lib/api";

const st = vi.hoisted(() => ({ args: [] as unknown[][], data: undefined as H2H | undefined }));
vi.mock("@/lib/queries", () => ({
  useHeadToHead: (...a: unknown[]) => { st.args.push(a); return { data: st.data, isPending: !st.data, isError: false, refetch: () => {} }; },
}));

const jugador = (username: string): LeaderboardEntry => ({
  username, total_battles: 5, wins: 3, losses: 1, ties: 1, win_rate_pct: 60, total_survivors: 5, form: [], streak: { type: null, length: 0 },
});
const players = [jugador("ash"), jugador("misty"), jugador("brock")];
const h2h: H2H = {
  a: "brock", b: "ash", wins_a: 3, wins_b: 1, ties: 1,
  battles: [{ battle_id: "b1", date: "2026-11-10T10:00:00Z", winner: "brock", turns: 21 }, { battle_id: "b2", date: "2026-11-09T10:00:00Z", winner: null, turns: 30 }],
  top_killer: { a: { species: "Onix", kills: 4 }, b: { species: "Pikachu", kills: 2 } },
};

const renderH2H = (props: Partial<React.ComponentProps<typeof HeadToHead>> = {}) =>
  render(<MemoryRouter><HeadToHead players={players} season={3} {...props} /></MemoryRouter>);

beforeEach(() => { st.args = []; st.data = h2h; });

describe("HeadToHead", () => {
  it("con sesión preselecciona al jugador contra el líder", () => {
    renderH2H({ me: "Brock" });
    expect(st.args.at(-1)).toEqual(["brock", "ash", 3]);
  });

  it("sin sesión, el primero contra el segundo", () => {
    renderH2H();
    expect(st.args.at(-1)).toEqual(["ash", "misty", 3]);
  });

  it("si el jugador con sesión es el líder, va contra el segundo", () => {
    renderH2H({ me: "ash" });
    expect(st.args.at(-1)).toEqual(["ash", "misty", 3]);
  });

  it("el jugador elegido en un lado no aparece en el otro", async () => {
    const user = userEvent.setup();
    renderH2H({ me: "brock" });
    await user.click(screen.getByRole("combobox", { name: "Jugador B" }));
    const opciones = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opciones.some((t) => t?.includes("brock"))).toBe(false);
    expect(opciones.some((t) => t?.includes("misty"))).toBe(true);
  });

  it("muestra el marcador, los empates, las batallas y el pokémon con más KOs", () => {
    renderH2H({ me: "brock" });
    const marcador = screen.getByRole("group", { name: "Marcador" });
    expect(marcador).toHaveTextContent("3");
    expect(marcador).toHaveTextContent("1");
    expect(screen.getByText("1 empate")).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Últimas batallas entre ellos" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lista).getByText(/Empate/)).toBeInTheDocument();
    expect(screen.getByText("Onix")).toBeInTheDocument();
    expect(screen.getByText("Pikachu")).toBeInTheDocument();
  });

  it("si nunca se enfrentaron, lo dice", () => {
    st.data = { ...h2h, wins_a: 0, wins_b: 0, ties: 0, battles: [], top_killer: { a: null, b: null } };
    renderH2H();
    expect(screen.getByText("Todavía no se enfrentaron")).toBeInTheDocument();
  });

  it("con menos de dos jugadores no se muestra", () => {
    const { container } = renderH2H({ players: [jugador("ash")] });
    expect(container).toBeEmptyDOMElement();
  });
});
