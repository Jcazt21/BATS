import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetEditor } from "./SetEditor";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import { __resetDexForTests } from "@/lib/dex/snapshot";
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

const DEX: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 0, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: { garchomp: species({ id: "garchomp", name: "Garchomp" }) },
  items: { leftovers: { id: "leftovers", name: "Leftovers", desc: "" } },
};

const baseMon = (over: Partial<BuilderMon> = {}): BuilderMon => ({
  species: "garchomp", held_item: null, ability: null, nature: null, tera_type: null,
  moves: [], evs: {}, ivs: {}, ...over,
});

const MOVES = {
  earthquake: { id: "earthquake", name: "Earthquake", type: "Ground", category: "Physical", basePower: 100, accuracy: 100, pp: 10, priority: 0, shortDesc: "" },
  dragontail: { id: "dragontail", name: "Dragon Tail", type: "Dragon", category: "Physical", basePower: 60, accuracy: 90, pp: 10, priority: -6, shortDesc: "" },
};
const NATURES = {
  impish: { name: "Impish", plus: "def", minus: "spa" },
  timid: { name: "Timid", plus: "spe", minus: "atk" },
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function installLearnsetFetch() {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/dex/learnsets/g.json") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ garchomp: ["earthquake", "dragontail"] }) } as Response);
    }
    if (url === "/dex/meta.json") return Promise.resolve({ ok: true, json: () => Promise.resolve(DEX.meta) } as Response);
    if (url.startsWith("/dex/moves.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(MOVES) } as Response);
    if (url.startsWith("/dex/natures.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(NATURES) } as Response);
    return Promise.resolve({ ok: false, status: 404 } as Response);
  }));
}

describe("SetEditor", () => {
  beforeEach(() => {
    __resetDexForTests();
    __resetLearnsetsForTests();
    installLearnsetFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("no ofrece un movimiento fuera del learnset", async () => {
    const user = userEvent.setup();
    renderWithClient(<SetEditor mon={baseMon()} dex={DEX} onChange={vi.fn()} />);
    const [firstMoveCombo] = await screen.findAllByPlaceholderText(/Movimiento 1/);
    await user.type(firstMoveCombo, "Psychic"); // no está en el learnset de Garchomp
    expect(await screen.findByText("Sin movimientos legales que coincidan")).toBeInTheDocument();
    await user.clear(firstMoveCombo);
    await user.type(firstMoveCombo, "Earthquake");
    expect(await screen.findByRole("option", { name: /Earthquake/ })).toBeInTheDocument();
  });

  it("muestra el error de EVs junto al EVEditor", async () => {
    renderWithClient(
      <SetEditor
        mon={baseMon({ evs: { HP: 252, Atk: 252, Def: 252 } })}
        dex={DEX}
        onChange={vi.fn()}
        errors={["El total de EVs no puede pasar de 510 (tiene 756)."]}
      />,
    );
    expect(await screen.findByText(/no puede pasar de 510/)).toBeInTheDocument();
  });

  it("cambiar la naturaleza actualiza el resumen de stats", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [mon, setMon] = useState<BuilderMon>(baseMon());
      return <SetEditor mon={mon} dex={DEX} onChange={setMon} />;
    }
    renderWithClient(<Wrapper />);
    const summary = await screen.findByLabelText("Resumen de stats");
    const before = summary.textContent;

    const natureCombo = await screen.findByPlaceholderText("Elegir naturaleza");
    await user.click(natureCombo);
    await user.click(await screen.findByRole("option", { name: /Impish/ }));

    expect(screen.getByLabelText("Resumen de stats").textContent).not.toBe(before);
  });
});
