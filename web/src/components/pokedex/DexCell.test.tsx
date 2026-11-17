import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DexCell as Cell } from "@/lib/dex/collection";
import type { Species } from "@/lib/dex/snapshot";
import { DexCell } from "./DexCell";

function makeSpecies(extra: Partial<Species> = {}): Species {
  return {
    id: "charizard", name: "Charizard", num: 6, types: ["Fire", "Flying"], bst: 534,
    baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    color: "Red", eggGroups: [], gen: 1, tags: [], abilities: ["Blaze"],
    spriteid: "charizard", baseSpecies: "Charizard", forme: null, prevo: null,
    isNonstandard: null, restricted: false, paradox: false, ultraBeast: false, pseudo: false, leagueLegal: true,
    ...extra,
  };
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

describe("DexCell", () => {
  it("descubierta aplica halo del tipo principal, indicador de origen y abre al pulsar", async () => {
    const onOpen = vi.fn();
    const cell: Cell = {
      num: 6, species: makeSpecies(), status: "seen", seenForms: ["Charizard"],
      firstSeen: { at: daysAgo(12), battleId: "b-1", opponent: "bea", species: "Charizard" },
    };
    render(<DexCell cell={cell} onOpen={onOpen} />);
    const btn = screen.getByRole("button", { name: "#006 Charizard" });
    expect(btn.className).toContain("dex-cell-discovered");
    expect(btn.style.getPropertyValue("--cell-type")).toBe("var(--type-fire)");
    expect(within(btn).getByLabelText("Visto en batalla")).toBeTruthy();
    expect(within(btn).queryByText("NUEVO")).toBeNull();
    await userEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith(cell);
  });

  it("muestra etiqueta NUEVO solo cuando se descubrió en los últimos 7 días", () => {
    const recent: Cell = {
      num: 445, species: makeSpecies({ id: "garchomp", name: "Garchomp", num: 445, types: ["Dragon", "Ground"] }),
      status: "seen", seenForms: ["Garchomp"],
      firstSeen: { at: daysAgo(2), battleId: "b-2", opponent: "ronny", species: "Garchomp" },
    };
    const evo: Cell = {
      num: 4, species: makeSpecies({ id: "charmander", name: "Charmander", num: 4, types: ["Fire"] }),
      status: "evolution", seenForms: [], via: "Charizard",
    };
    const { rerender } = render(<DexCell cell={recent} onOpen={vi.fn()} />);
    expect(screen.getByText("NUEVO")).toBeTruthy();
    expect(screen.getByRole("button").style.getPropertyValue("--cell-type")).toBe("var(--type-dragon)");

    rerender(<DexCell cell={evo} onOpen={vi.fn()} />);
    expect(screen.queryByText("NUEVO")).toBeNull();
    expect(screen.getByLabelText("Descubierto por evolución")).toBeTruthy();
  });

  it("sin descubrir muestra ??? y silueta más apagada sin botón interactivo", () => {
    const unknown: Cell = { num: 4, species: makeSpecies({ id: "charmander", name: "Charmander", num: 4 }), status: "unknown", seenForms: [] };
    const { container } = render(<DexCell cell={unknown} onOpen={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("???")).toBeTruthy();
    expect(screen.queryByText("NUEVO")).toBeNull();
    const box = container.firstElementChild as HTMLElement;
    expect(box.getAttribute("aria-label")).toBe("#004 sin descubrir");
    expect(box.innerHTML).toContain("opacity-45");
  });

  it("en modo compacto usa un sprite más chico", () => {
    const cell: Cell = { num: 6, species: makeSpecies(), status: "seen", seenForms: ["Charizard"] };
    const { container } = render(<DexCell cell={cell} onOpen={vi.fn()} compact />);
    const sprite = container.querySelector("span[style*='width: 52px']");
    expect(sprite).toBeTruthy();
  });
});
