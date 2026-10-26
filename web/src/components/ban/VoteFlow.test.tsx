import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoteFlow } from "./VoteFlow";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({
  session: { session: { token: "t" } as unknown, loading: false },
  elig: {} as Q,
  ranking: {} as Q,
  submit: vi.fn(),
  detail: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ useSession: () => st.session }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/lib/queries", () => ({
  useEligibility: () => st.elig,
  useBanRanking: () => st.ranking,
  useSubmitBan: () => ({ mutateAsync: st.submit, isPending: false }),
}));
vi.mock("@/lib/pokeapi", () => ({
  loadAllPokemon: () => Promise.resolve(),
  searchPokemon: () => [],
  getPokemonDetail: (...a: unknown[]) => st.detail(...a),
}));
vi.mock("@/components/SignInCard", () => ({ SignInCard: () => <div>entrar</div> }));

const ranking = [
  { season_id: 1, pokemon_name: "Garchomp", pokemon_types: "Dragon / Ground", sprite_url: null, national_dex: 445, total_votes: 5, ranking: 1 },
  { season_id: 1, pokemon_name: "Gengar", pokemon_types: "Ghost / Poison", sprite_url: null, national_dex: 94, total_votes: 3, ranking: 2 },
];

beforeEach(() => {
  st.session = { session: { token: "t" }, loading: false };
  st.elig = { isPending: false, data: { can_vote: true } };
  st.ranking = { isPending: false, data: ranking };
  st.submit.mockReset().mockResolvedValue(undefined);
  st.detail.mockReset().mockResolvedValue({ id: 445, name: "garchomp", displayName: "Garchomp", types: "Dragon / Ground", sprite: null });
});

describe("VoteFlow · carga", () => {
  it("mientras se verifica la sesión muestra un esqueleto, no nada", () => {
    st.session = { session: null, loading: true };
    render(<VoteFlow />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });

  it("mientras se verifica tu cuenta muestra un esqueleto con role=status", () => {
    st.elig = { isPending: true };
    render(<VoteFlow />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("VoteFlow · buscador", () => {
  it("antes de escribir sugiere los más votados", () => {
    render(<VoteFlow />);
    const lista = screen.getByRole("list", { name: "Más votados" });
    expect(lista).toHaveTextContent("Garchomp");
    expect(lista).toHaveTextContent("Gengar");
  });

  it("al escribir las sugerencias dan paso a los resultados", async () => {
    render(<VoteFlow />);
    await userEvent.type(screen.getByRole("textbox", { name: "Buscar pokémon" }), "zzz");
    expect(screen.queryByRole("list", { name: "Más votados" })).not.toBeInTheDocument();
  });

  it("elegir una sugerencia abre la confirmación del voto", async () => {
    render(<VoteFlow />);
    await userEvent.click(screen.getByRole("button", { name: /Garchomp/ }));
    expect(st.detail).toHaveBeenCalledWith(445);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("¿Votar por banear a Garchomp?");
  });
});

describe("VoteFlow · confirmación", () => {
  it("al confirmar pasa a 'Voto registrado' anunciado con role=status", async () => {
    render(<VoteFlow />);
    await userEvent.click(screen.getByRole("button", { name: /Garchomp/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar voto" }));
    await waitFor(() => expect(st.submit).toHaveBeenCalled());
    const estado = await screen.findByRole("status");
    expect(estado).toHaveTextContent("Voto registrado");
    expect(estado).toHaveClass("animate-in", "fade-in-0");
  });
});
