import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetEditor } from "./SetEditor";
import type { Dex, Species } from "@/lib/dex/snapshot";
import { __resetLearnsetsForTests } from "@/lib/dex/learnsets";
import type { BuilderMon } from "@/lib/dex/validate";

function species(over: Partial<Species> & { id: string; name: string }): Species {
  return {
    num: 1, types: ["Dragon", "Ground"], bst: 600, baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    color: "Blue", eggGroups: ["Monster", "Dragon"], gen: 4, tags: [], abilities: ["Sand Veil", "Rough Skin"],
    spriteid: over.id, baseSpecies: over.name, forme: null, prevo: null, isNonstandard: null, restricted: false,
    paradox: false, ultraBeast: false, pseudo: true, leagueLegal: true, ...over,
  };
}

const DEX: Dex = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 0, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: { garchomp: species({ id: "garchomp", name: "Garchomp" }) },
  moves: {
    earthquake: { id: "earthquake", name: "Earthquake", type: "Ground", category: "Physical", basePower: 100, accuracy: 100, pp: 10, priority: 0, shortDesc: "" },
    dragontail: { id: "dragontail", name: "Dragon Tail", type: "Dragon", category: "Physical", basePower: 60, accuracy: 90, pp: 10, priority: -6, shortDesc: "" },
  },
  items: { leftovers: { id: "leftovers", name: "Leftovers", desc: "" } },
  abilities: {},
  natures: {
    impish: { name: "Impish", plus: "def", minus: "spa" },
    timid: { name: "Timid", plus: "spe", minus: "atk" },
  },
};

const baseMon = (over: Partial<BuilderMon> = {}): BuilderMon => ({
  species: "garchomp", held_item: null, ability: null, nature: null, tera_type: null,
  moves: [], evs: {}, ivs: {}, ...over,
});

function installLearnsetFetch() {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/dex/learnsets/g.json") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ garchomp: ["earthquake", "dragontail"] }) } as Response);
    }
    return Promise.resolve({ ok: false, status: 404 } as Response);
  }));
}

describe("SetEditor", () => {
  beforeEach(() => {
    __resetLearnsetsForTests();
    installLearnsetFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("no ofrece un movimiento fuera del learnset", async () => {
    const user = userEvent.setup();
    render(<SetEditor mon={baseMon()} dex={DEX} onChange={vi.fn()} />);
    const [firstMoveCombo] = screen.getAllByPlaceholderText(/Movimiento 1/);
    await user.type(firstMoveCombo, "Psychic"); // no está en el learnset de Garchomp
    expect(await screen.findByText("Sin movimientos legales que coincidan")).toBeInTheDocument();
    await user.clear(firstMoveCombo);
    await user.type(firstMoveCombo, "Earthquake");
    expect(await screen.findByRole("option", { name: /Earthquake/ })).toBeInTheDocument();
  });

  it("muestra el error de EVs junto al EVEditor", () => {
    render(
      <SetEditor
        mon={baseMon({ evs: { HP: 252, Atk: 252, Def: 252 } })}
        dex={DEX}
        onChange={vi.fn()}
        errors={["El total de EVs no puede pasar de 510 (tiene 756)."]}
      />,
    );
    expect(screen.getByText(/no puede pasar de 510/)).toBeInTheDocument();
  });

  it("cambiar la naturaleza actualiza el resumen de stats", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [mon, setMon] = useState<BuilderMon>(baseMon());
      return <SetEditor mon={mon} dex={DEX} onChange={setMon} />;
    }
    render(<Wrapper />);
    const summary = screen.getByLabelText("Resumen de stats");
    const before = summary.textContent;

    const natureCombo = screen.getByPlaceholderText("Elegir naturaleza");
    await user.click(natureCombo);
    await user.click(await screen.findByRole("option", { name: /Impish/ }));

    expect(screen.getByLabelText("Resumen de stats").textContent).not.toBe(before);
  });
});
