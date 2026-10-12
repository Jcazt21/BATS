import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/lib/http";
import { TeamPage } from "./TeamPage";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; error?: unknown; refetch?: () => void };
const state = vi.hoisted(() => ({ me: {} as Q, season: {} as Q }));

vi.mock("@/lib/session", () => ({ useSession: () => ({ session: { token: "t" }, loading: false }) }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/lib/queries", () => ({
  useActiveSeason: () => state.season,
  useMe: () => state.me,
  useDexEssentials: () => ({ isPending: false, isError: false, data: { species: {}, items: {}, meta: {} } }),
  useRoster: () => ({ isPending: false, isError: true, error: new ApiError(404, "sin equipo"), refetch: () => {} }),
  usePlayerBans: () => ({ data: [] }),
  useRegisterTeam: () => ({ mutateAsync: vi.fn() }),
  useAddPokemon: () => ({}), useEditSet: () => ({}), useRemovePokemon: () => ({}),
  useSwapPokemon: () => ({}), useRotationHistory: () => ({ isPending: true }),
}));
// Se comprueba solo qué clave de borrador recibe el builder.
vi.mock("@/components/builder/TeamBuilder", () => ({
  TeamBuilder: ({ draftKey }: { draftKey?: string }) => <div data-testid="builder">{draftKey ?? "sin-clave"}</div>,
}));

const season = { season_id: 3, season_name: "T3", max_team_size: 6, restrictions: {} };

function renderPage() {
  return render(<MemoryRouter><TeamPage /></MemoryRouter>);
}

beforeEach(() => {
  state.season = { data: season };
  state.me = { data: { username: "ash" } };
});

describe("TeamPage: registro y borrador", () => {
  it("espera a me y a la temporada antes de montar el builder", () => {
    state.me = { isPending: true };
    const { rerender } = renderPage();
    expect(screen.queryByTestId("builder")).toBeNull();
    state.me = { data: { username: "ash" } };
    state.season = { isPending: true };
    rerender(<MemoryRouter><TeamPage /></MemoryRouter>);
    expect(screen.queryByTestId("builder")).toBeNull();
  });

  it("monta el builder con la clave del borrador cuando todo cargó", () => {
    renderPage();
    expect(screen.getByTestId("builder")).toHaveTextContent("bats:teambuilder:3:ash");
  });

  it("si me falla, monta el builder sin clave", () => {
    state.me = { isError: true, error: new ApiError(401, "x") };
    renderPage();
    expect(screen.getByTestId("builder")).toHaveTextContent("sin-clave");
  });
});
