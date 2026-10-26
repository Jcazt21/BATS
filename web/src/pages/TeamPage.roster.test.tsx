import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { abrirMenu } from "@/lib/test-utils";
import { MemoryRouter } from "react-router-dom";
import { TeamPage } from "./TeamPage";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; error?: unknown; refetch?: () => void };
const st = vi.hoisted(() => ({
  session: { session: { token: "t" } as unknown, loading: false },
  dex: { isPending: false, isError: false, data: { species: {}, items: {}, meta: {} } } as Q,
  roster: {} as Q,
  remove: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ useSession: () => st.session }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/lib/queries", () => ({
  useActiveSeason: () => ({ data: { season_id: 3, season_name: "T3", max_team_size: 8, restrictions: {} } }),
  useMe: () => ({ data: { username: "ash" } }),
  useDexEssentials: () => st.dex,
  useRoster: () => st.roster,
  usePlayerBans: () => ({ data: [] }),
  useRegisterTeam: () => ({ mutateAsync: vi.fn() }),
  useAddPokemon: () => ({}), useEditSet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemovePokemon: () => ({ mutateAsync: st.remove, isPending: false }),
  useSwapPokemon: () => ({}), useRotationHistory: () => ({ isPending: false, data: { rotations: [] } }),
}));
vi.mock("@/components/builder/TeamBuilder", () => ({ TeamBuilder: () => <div /> }));
// El editor real es enorme: basta con poder provocar un cambio.
vi.mock("@/components/builder/SetEditor", () => ({
  SetEditor: ({ mon, onChange }: { mon: { nature: string | null }; onChange: (m: unknown) => void }) => (
    <button onClick={() => onChange({ ...mon, nature: "Jolly" })}>tocar set</button>
  ),
}));
vi.mock("@/lib/dex/useLearnset", () => ({ useLearnset: () => ({ learnset: {}, error: null }) }));
vi.mock("@/lib/dex/validate", () => ({ checkSet: () => [] }));

const mon = (id: number, name: string) => ({
  pokemon_id: id, name, held_item: null, ability: null, nature: null, tera_type: null, moves: [], evs: {}, ivs: {},
  types: null, sprite_url: null, in_lineup: false,
});
const roster = {
  pool: [mon(1, "Dragonite"), mon(2, "Gengar")], max_team_size: 8, max_rotations: 3, rotations_used: 0, rotations_remaining: 3,
  validation: { state: "ok", errors: [] },
};

function renderPage() {
  return render(<MemoryRouter><TeamPage /></MemoryRouter>);
}

beforeEach(() => {
  st.session = { session: { token: "t" }, loading: false };
  st.dex = { isPending: false, isError: false, data: { species: {}, items: {}, meta: {} } };
  st.roster = { isPending: false, data: roster };
  st.remove.mockReset();
});

describe("TeamPage · carga", () => {
  it("mientras carga la sesión muestra un estado de carga, no una página en blanco", () => {
    st.session = { session: null, loading: true };
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });

  it("mientras carga el dex muestra el estado de carga", () => {
    st.dex = { isPending: true };
    renderPage();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("mientras carga el equipo muestra el estado de carga", () => {
    st.roster = { isPending: true };
    renderPage();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("al resolver, el contenido entra con Reveal", () => {
    const { container } = renderPage();
    expect(container.querySelector(".animate-in.fade-in-0")).toBeInTheDocument();
  });
});

describe("TeamPage · acciones por Pokémon", () => {
  it("cada tarjeta tiene 'Editar' como acción principal y un menú 'Más'", () => {
    renderPage();
    const lista = screen.getByRole("list", { name: "Pokémon de tu equipo" });
    expect(within(lista).getAllByRole("button", { name: /Editar/ })).toHaveLength(2);
    expect(within(lista).getByRole("button", { name: "Más acciones de Gengar" })).toBeInTheDocument();
  });

  it("Quitar desde el menú pide confirmación y no quita hasta confirmar", async () => {
    renderPage();
    await abrirMenu(screen.getByRole("button", { name: "Más acciones de Gengar" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Quitar/ }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("¿Quitar a Gengar?");
    expect(st.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Quitar" }));
    expect(st.remove).toHaveBeenCalledWith(2);
  });
});

describe("TeamPage · descartar cambios", () => {
  async function abrirEditor() {
    renderPage();
    await userEvent.click(screen.getAllByRole("button", { name: /Editar/ })[0]);
    return screen.findByRole("dialog");
  }

  it("cerrar el editor sin cambios NO pide confirmación", async () => {
    await abrirEditor();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cerrar el editor con cambios sin guardar SÍ pide confirmación", async () => {
    const editor = await abrirEditor();
    await userEvent.click(within(editor).getByRole("button", { name: "tocar set" }));
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("¿Descartar los cambios?");
  });
});

describe("TeamPage · resumen, reglas y rotaciones", () => {
  it("monta el resumen del equipo al inicio con el estado de validación", () => {
    renderPage();
    const resumen = screen.getByRole("region", { name: "Resumen del equipo" });
    expect(resumen).toHaveTextContent("Válido");
  });

  it("los errores de Showdown son una lista y 'Ir al set' abre el editor del pokémon mencionado", async () => {
    st.roster = { isPending: false, data: { ...roster, validation: { state: "errors", errors: ["Gengar: Shadow Ball es ilegal.", "Equipo inválido"], checked_at: null } } };
    renderPage();
    const alerta = screen.getByRole("alert");
    expect(within(alerta).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Resumen del equipo" })).toHaveTextContent("2 errores");
    const ir = within(alerta).getAllByRole("button", { name: /Ir al set/ });
    expect(ir).toHaveLength(1); // solo el que nombra a un pokémon del pool
    await userEvent.click(ir[0]);
    expect(await screen.findByRole("dialog")).toHaveTextContent("Gengar");
  });

  it("las reglas de rotación están plegadas por defecto", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Cómo funcionan/ })).toHaveAttribute("aria-expanded", "false");
  });
});
