import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamBuilder } from "./TeamBuilder";
import { loadDraft, saveDraft } from "@/lib/draft";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import type { BuilderMon } from "@/lib/dex/validate";

vi.mock("@/lib/dex/useLearnset", () => ({
  useLearnset: () => ({ learnset: [], error: null, retry: () => {} }),
  useLearnsets: () => ({ map: {}, pending: false, error: null, retry: () => {} }),
}));
vi.mock("@/components/builder/SetEditor", () => ({
  SetEditor: ({ mon }: { mon: BuilderMon }) => <div data-testid="editor">{mon.species}</div>,
}));
vi.mock("@/components/builder/SpeciesPicker", () => ({
  SpeciesPicker: ({ open, onPick }: { open: boolean; onPick: (s: { name: string }) => void }) =>
    open ? <button onClick={() => onPick({ name: "Gengar" })}>elegir Gengar</button> : null,
}));
// PasteIO se prueba aparte; aquí solo se ejercita el modo con el que TeamBuilder aplica el import.
vi.mock("@/components/builder/PasteIO", () => ({
  PasteIO: ({ onImport }: { onImport: (m: BuilderMon[], mode: "replace" | "append") => void }) => (
    <>
      <button onClick={() => onImport([mon("Gengar")], "append")}>importar-agregar</button>
      <button onClick={() => onImport([mon("Gengar")], "replace")}>importar-reemplazar</button>
    </>
  ),
}));

function species(id: string, name: string, types: string[]): Species {
  return {
    id, name, types, num: 1, bst: 300, baseStats: {}, color: "Blue", eggGroups: [], gen: 1,
    tags: [], abilities: [], spriteid: id, baseSpecies: name, forme: null, prevo: null,
    isNonstandard: null, restricted: false, paradox: false, ultraBeast: false,
    pseudo: false, leagueLegal: true,
  };
}

const dex: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 2, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: {
    garchomp: species("garchomp", "Garchomp", ["Dragon", "Ground"]),
    gengar: species("gengar", "Gengar", ["Ghost", "Poison"]),
  },
  items: {},
};

function mon(name: string): BuilderMon {
  return { species: name, moves: [], evs: {}, ivs: {} };
}

const KEY = "bats:teambuilder:3:ash";

function renderBuilder(props: Partial<React.ComponentProps<typeof TeamBuilder>> = {}) {
  return render(
    <TeamBuilder dex={dex} initial={[]} season={{ restrictions: {} }} banned={new Set()} maxSize={6}
      onSave={vi.fn().mockResolvedValue(undefined)} {...props} />,
  );
}

beforeEach(() => localStorage.clear());

describe("TeamBuilder: borrador", () => {
  it("restaura el borrador si initial está vacío y avisa", () => {
    saveDraft(KEY, [mon("Garchomp")]);
    renderBuilder({ draftKey: KEY });
    expect(screen.getByText(/Recuperamos tu borrador del/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Pokémon del equipo" })).toHaveTextContent("Garchomp");
  });

  it("no restaura si initial trae pokémon", () => {
    saveDraft(KEY, [mon("Garchomp")]);
    renderBuilder({ draftKey: KEY, initial: [mon("Gengar")] });
    expect(screen.queryByText(/Recuperamos tu borrador/)).toBeNull();
    expect(screen.getByRole("list", { name: "Pokémon del equipo" })).not.toHaveTextContent("Garchomp");
  });

  it("Descartar borra el borrador y vacía el equipo", async () => {
    const user = userEvent.setup();
    saveDraft(KEY, [mon("Garchomp")]);
    renderBuilder({ draftKey: KEY });
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.queryByText(/Recuperamos tu borrador/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Quitar" })).toBeNull();
    expect(loadDraft(KEY)).toBeNull();
  });

  it("autoguarda con debounce y deja de guardar un equipo vacío", async () => {
    const user = userEvent.setup();
    renderBuilder({ draftKey: KEY });
    await user.click(screen.getByRole("button", { name: /Agregar pokémon/ }));
    await user.click(screen.getByRole("button", { name: "elegir Gengar" }));
    expect(loadDraft(KEY)).toBeNull();
    await waitFor(() => expect(loadDraft(KEY)?.team.map((m) => m.species)).toEqual(["Gengar"]), { timeout: 2000 });
    await user.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(loadDraft(KEY)).toBeNull(), { timeout: 2000 });
  });

  it("borra el borrador cuando onSave termina bien", async () => {
    const user = userEvent.setup();
    saveDraft(KEY, [mon("Garchomp")]);
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderBuilder({ draftKey: KEY, onSave });
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // Pasado el debounce no debe reaparecer.
    await act(() => new Promise((r) => setTimeout(r, 700)));
    expect(loadDraft(KEY)).toBeNull();
  });

  it("conserva el borrador si onSave falla", async () => {
    const user = userEvent.setup();
    saveDraft(KEY, [mon("Garchomp")]);
    renderBuilder({ draftKey: KEY, onSave: vi.fn().mockRejectedValue(new Error("x")) });
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByRole("alert");
    expect(loadDraft(KEY)).not.toBeNull();
  });

  it("sin draftKey no guarda nada", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: /Agregar pokémon/ }));
    await user.click(screen.getByRole("button", { name: "elegir Gengar" }));
    await act(() => new Promise((r) => setTimeout(r, 700)));
    expect(localStorage.length).toBe(0);
  });
});

describe("TeamBuilder: cambios sin guardar", () => {
  it("avisa onDirtyChange al editar y al volver al estado inicial", async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderBuilder({ initial: [mon("Garchomp")], onDirtyChange });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});

describe("TeamBuilder: importar", () => {
  it("append suma al final; replace sustituye", async () => {
    const user = userEvent.setup();
    renderBuilder({ initial: [mon("Garchomp")] });
    await user.click(screen.getByRole("button", { name: "importar-agregar" }));
    const list = screen.getByRole("list", { name: "Pokémon del equipo" });
    expect(list).toHaveTextContent("Garchomp");
    expect(list).toHaveTextContent("Gengar");
    await user.click(screen.getByRole("button", { name: "importar-reemplazar" }));
    expect(list).not.toHaveTextContent("Garchomp");
    expect(list).toHaveTextContent("Gengar");
  });
});

describe("TeamBuilder: borrador con clave tardía", () => {
  it("al remontar con la clave (key distinto) restaura el borrador", () => {
    saveDraft(KEY, [mon("Garchomp")]);
    const props = { dex, initial: [] as BuilderMon[], season: { restrictions: {} }, banned: new Set<string>(), maxSize: 6, onSave: vi.fn() };
    const { rerender } = render(<TeamBuilder key="sin-borrador" {...props} />);
    expect(screen.queryByText(/Recuperamos tu borrador/)).toBeNull();
    rerender(<TeamBuilder key={KEY} {...props} draftKey={KEY} />);
    expect(screen.getByText(/Recuperamos tu borrador del/)).toBeInTheDocument();
  });
});
