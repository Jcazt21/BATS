import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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
  firefang: { id: "firefang", name: "Fire Fang", type: "Fire", category: "Physical", basePower: 65, accuracy: 95, pp: 15, priority: 0, shortDesc: "10% chance to burn. 10% chance to flinch." },
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
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ garchomp: ["earthquake", "dragontail", "firefang"] }) } as Response);
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
        problems={[{ field: "evs", code: "ev_total", message: "El total de EVs no puede pasar de 510 (tiene 756)." }]}
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

  it("vaciar un movimiento lo quita sin dejar huecos", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithClient(<SetEditor mon={baseMon({ moves: ["Earthquake", "Dragon Tail"] })} dex={DEX} onChange={onChange} />);
    await user.click(await screen.findByRole("button", { name: "Quitar movimiento 1" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ moves: ["Dragon Tail"] }));
  });

  it("vaciar el objeto lo deja en null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithClient(<SetEditor mon={baseMon({ held_item: "Leftovers" })} dex={DEX} onChange={onChange} />);
    await user.click(await screen.findByRole("button", { name: "Quitar objeto" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ held_item: null }));
  });

  it("no ofrece en otro slot un movimiento ya elegido", async () => {
    const user = userEvent.setup();
    renderWithClient(<SetEditor mon={baseMon({ moves: ["Earthquake"] })} dex={DEX} onChange={vi.fn()} />);
    const secondSlot = await screen.findByPlaceholderText(/Movimiento 2/);
    await user.type(secondSlot, "Earth");
    expect(await screen.findByText("Sin movimientos legales que coincidan")).toBeInTheDocument();
  });

  it("marca STAB solo en los movimientos del tipo de la especie", async () => {
    const user = userEvent.setup();
    renderWithClient(<SetEditor mon={baseMon()} dex={DEX} onChange={vi.fn()} />);
    await user.click(await screen.findByPlaceholderText(/Movimiento 1/));
    expect(await screen.findByRole("option", { name: /Earthquake.*STAB/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Fire Fang/ }).textContent).not.toMatch(/STAB/);
  });

  it("busca movimientos por tipo y muestra la descripción del elegido", async () => {
    const user = userEvent.setup();
    renderWithClient(<SetEditor mon={baseMon({ moves: ["Fire Fang"] })} dex={DEX} onChange={vi.fn()} />);
    expect(await screen.findByText(/10% chance to burn/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Movimiento 2/), "ground");
    expect(await screen.findByRole("option", { name: /Earthquake/ })).toBeInTheDocument();
  });

  it("elegir en un slot vacío lejano agrega el movimiento sin huecos", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithClient(<SetEditor mon={baseMon({ moves: ["Earthquake"] })} dex={DEX} onChange={onChange} />);
    await user.click(await screen.findByPlaceholderText(/Movimiento 4/));
    await user.click(await screen.findByRole("option", { name: /Fire Fang/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ moves: ["Earthquake", "Fire Fang"] }));
  });

  it("marca en el resumen la stat que sube y la que baja la naturaleza", async () => {
    renderWithClient(<SetEditor mon={baseMon({ nature: "Impish" })} dex={DEX} onChange={vi.fn()} />);
    const summary = await screen.findByLabelText("Resumen de stats");
    expect(within(summary).getByLabelText(/^Def .*sube por la naturaleza/)).toHaveTextContent("↑");
    expect(within(summary).getByLabelText(/^SpA .*baja por la naturaleza/)).toHaveTextContent("↓");
    expect(within(summary).getByLabelText(/^Atk \d+$/)).not.toHaveTextContent(/[↑↓]/);
  });

  it("muestra y deja quitar un movimiento que la especie no aprende", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithClient(<SetEditor mon={baseMon({ moves: ["Psychic"] })} dex={DEX} onChange={onChange} />);
    expect(await screen.findByPlaceholderText("Psychic")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar movimiento 1" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ moves: [] }));
  });

  it("mientras carga el learnset, los slots vacíos están deshabilitados con 'Cargando movimientos…'", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/dex/learnsets/g.json") return new Promise(() => {}); // nunca resuelve
      if (url === "/dex/meta.json") return Promise.resolve({ ok: true, json: () => Promise.resolve(DEX.meta) } as Response);
      if (url.startsWith("/dex/moves.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(MOVES) } as Response);
      if (url.startsWith("/dex/natures.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(NATURES) } as Response);
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }));
    renderWithClient(<SetEditor mon={baseMon({ moves: ["Earthquake"] })} dex={DEX} onChange={vi.fn()} />);
    const loading = await screen.findAllByPlaceholderText("Cargando movimientos…");
    expect(loading).toHaveLength(3);
    for (const el of loading) expect(el).toBeDisabled();
    // El movimiento ya elegido sigue mostrando su nombre.
    expect(screen.getByPlaceholderText("Earthquake")).toBeInTheDocument();
  });

  it("si el learnset falla, avisa y Reintentar vuelve a pedirlo", async () => {
    const user = userEvent.setup();
    let fail = true;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/dex/learnsets/g.json") {
        if (fail) return Promise.reject(new Error("sin red"));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ garchomp: ["earthquake"] }) } as Response);
      }
      if (url === "/dex/meta.json") return Promise.resolve({ ok: true, json: () => Promise.resolve(DEX.meta) } as Response);
      if (url.startsWith("/dex/moves.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(MOVES) } as Response);
      if (url.startsWith("/dex/natures.json")) return Promise.resolve({ ok: true, json: () => Promise.resolve(NATURES) } as Response);
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }));
    renderWithClient(<SetEditor mon={baseMon()} dex={DEX} onChange={vi.fn()} />);
    expect(await screen.findByText("No se pudieron cargar los movimientos")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findAllByPlaceholderText(/Movimiento 1/)).toHaveLength(1);
    expect(screen.queryByText("No se pudieron cargar los movimientos")).not.toBeInTheDocument();
  });

  it("deja quitar una habilidad que la especie no tiene", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithClient(<SetEditor mon={baseMon({ ability: "Levitate" })} dex={DEX} onChange={onChange} />);
    await user.click(await screen.findByRole("button", { name: "Quitar habilidad" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ability: null }));
  });
});

describe("SetEditor: secciones y errores por campo", () => {
  beforeEach(() => { installLearnsetFetch(); __resetDexForTests(); __resetLearnsetsForTests(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("tiene las secciones Básico, Movimientos y Entrenamiento", async () => {
    renderWithClient(<SetEditor mon={baseMon()} dex={DEX} onChange={vi.fn()} />);
    for (const name of ["Básico", "Movimientos", "Entrenamiento"]) {
      expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("un problema de naturaleza o de tera se pinta en su campo (sin regex)", async () => {
    renderWithClient(
      <SetEditor
        mon={baseMon()} dex={DEX} onChange={vi.fn()}
        problems={[
          { field: "nature", code: "bad_nature", message: "Naturaleza inventada." },
          { field: "tera", code: "bad_tera:x", message: "Tera inventado." },
        ]}
      />,
    );
    const nature = (await screen.findByText("Naturaleza inventada.")).closest("label")!;
    expect(within(nature).getByText("Naturaleza")).toBeInTheDocument();
    const tera = screen.getByText("Tera inventado.").closest("label")!;
    expect(within(tera).getByText("Tera Type")).toBeInTheDocument();
  });

  it("Tera es un Combobox, sin <select> nativos, y el valor por defecto es explícito", async () => {
    const { container } = renderWithClient(<SetEditor mon={baseMon()} dex={DEX} onChange={vi.fn()} />);
    expect(await screen.findByPlaceholderText("Tipo primario (Dragón)")).toBeInTheDocument();
    expect(container.querySelector("select")).toBeNull();
  });

  it("elegir un Tera guarda el tipo en inglés; volver al primario lo deja en null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithClient(<SetEditor mon={baseMon()} dex={DEX} onChange={onChange} />);
    await user.click(await screen.findByPlaceholderText("Tipo primario (Dragón)"));
    await user.click(await screen.findByRole("option", { name: /Fuego/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tera_type: "Fire" }));
  });

  it("el resumen de stats está dentro de la sección de entrenamiento", async () => {
    renderWithClient(<SetEditor mon={baseMon()} dex={DEX} onChange={vi.fn()} />);
    const summary = await screen.findByLabelText("Resumen de stats");
    expect(summary.parentElement).toContainElement(screen.getByRole("progressbar", { name: "Total de EVs" }));
  });
});
