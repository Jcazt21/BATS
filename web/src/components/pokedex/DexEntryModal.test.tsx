import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { DexCell } from "@/lib/dex/collection";
import type { Species } from "@/lib/dex/snapshot";
import { mockViewport, restoreMatchMedia } from "@/lib/test-utils";
import { DexEntryModal } from "./DexEntryModal";

type Q = { data?: unknown; isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown };

const st = vi.hoisted(() => ({
  dex: {} as Q,
  stats: {} as Q,
  playerStats: {} as Q,
  playerStatsUser: undefined as string | undefined,
  statsSpecies: undefined as string | undefined,
}));

vi.mock("@/lib/queries", () => ({
  useDexEssentials: () => st.dex,
  useDexDetails: () => ({ data: undefined }),
  usePokemonStatsEntry: (sp: string) => {
    st.statsSpecies = sp;
    return st.stats;
  },
  usePlayerPokedexStats: (u?: string) => {
    st.playerStatsUser = u;
    return st.playerStats;
  },
}));

vi.mock("@/lib/card-image", async (orig) => ({ ...(await orig<object>()), renderCardImage: () => Promise.resolve(null) }));
vi.mock("@/lib/sprite-overlay", async (orig) => ({ ...(await orig<object>()), resolveOverlaySprite: () => Promise.resolve(null) }));

function sp(id: string, name: string, num: number, extra: Partial<Species> = {}): Species {
  return {
    id,
    name,
    num,
    types: ["Fire", "Flying"],
    bst: 534,
    baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    color: "Red",
    eggGroups: [],
    gen: 1,
    tags: [],
    abilities: ["Blaze", "Solar Power"],
    spriteid: id,
    baseSpecies: name,
    forme: null,
    prevo: null,
    isNonstandard: null,
    restricted: false,
    paradox: false,
    ultraBeast: false,
    pseudo: false,
    leagueLegal: true,
    ...extra,
  };
}

const CHARIZARD = sp("charizard", "Charizard", 6);
const CHARIZARD_Y = sp("charizardmegay", "Charizard-Mega-Y", 6, {
  baseSpecies: "Charizard",
  forme: "Mega-Y",
  abilities: ["Drought"],
  baseStats: { hp: 78, atk: 104, def: 78, spa: 159, spd: 115, spe: 100 },
});
const CHARMANDER = sp("charmander", "Charmander", 4, { types: ["Fire"], abilities: ["Blaze"] });
const HEATRAN = sp("heatran", "Heatran", 485, { types: ["Fire", "Steel"], gen: 4, abilities: ["Flash Fire"] });

const seenCell = (species: Species, seenForms: string[] = [species.name]): DexCell => ({
  num: species.num,
  species,
  status: "seen",
  seenForms,
  firstSeen: { at: "2026-11-05T00:00:00Z", battleId: "b-1", opponent: "bea", species: seenForms[0] },
});

const evoCell = (species: Species, via: string): DexCell => ({
  num: species.num,
  species,
  status: "evolution",
  seenForms: [],
  via,
});

function renderModal(props: Partial<Parameters<typeof DexEntryModal>[0]> = {}) {
  const onClose = props.onClose ?? vi.fn();
  return {
    onClose,
    ...render(
      <MemoryRouter>
        <DexEntryModal cell={seenCell(CHARIZARD)} onClose={onClose} {...props} />
      </MemoryRouter>,
    ),
  };
}

beforeEach(() => {
  mockViewport(true);
  st.playerStatsUser = undefined;
  st.statsSpecies = undefined;
  st.dex = {
    isSuccess: true,
    data: {
      species: {
        charizard: CHARIZARD,
        charizardmegay: CHARIZARD_Y,
        charmander: CHARMANDER,
        heatran: HEATRAN,
      },
      items: {},
      meta: {},
    },
  };
  st.stats = {
    isSuccess: true,
    isPending: false,
    data: {
      pick_pct: 31,
      win_rate_pct: 58,
      avg_mvp: 2.4,
      sets: {
        players: 2,
        moves: [{ name: "Flamethrower", count: 2 }],
        items: [{ name: "Heavy-Duty Boots", count: 2 }],
        abilities: [{ name: "Solar Power", count: 2 }],
        natures: [],
        tera_types: [],
      },
    },
  };
  st.playerStats = {
    isSuccess: true,
    isPending: false,
    data: {
      username: "jazar",
      species: [
        {
          species: "Charizard",
          used: {
            battles: 3,
            kills: 5,
            mvp: 9.5,
            best: { battle_id: "b-1", kills: 2, mvp: 4.5, opponent: "bea", date: "2026-11-01" },
          },
          faced: { battles: 2, kills_against: 3, wins: 1 },
        },
        {
          species: "Charizard-Mega-Y",
          used: {
            battles: 4,
            kills: 7,
            mvp: 11.75,
            best: { battle_id: "b-2", kills: 3, mvp: 7.25, opponent: "kael", date: "2026-11-08" },
          },
          faced: null,
        },
        {
          species: "Heatran",
          used: null,
          faced: { battles: 4, kills_against: 3, wins: 3 },
        },
      ],
    },
  };
});

describe("DexEntryModal", () => {
  it("caso usado: suma todas las formas de la casilla, muestra Tus KOs/MVP/Batallas y gana sobre enfrentado", () => {
    renderModal({ cell: seenCell(CHARIZARD, ["Charizard-Mega-Y", "Charizard"]), username: "jazar", isOwn: true });
    const dialog = screen.getByRole("dialog");
    expect(st.playerStatsUser).toBe("jazar");
    expect(within(dialog).getByText("Tus KOs").nextSibling?.textContent).toBe("12");
    expect(within(dialog).getByText("Tu MVP").nextSibling?.textContent).toBe("21,25");
    expect(within(dialog).getByText("Tus batallas").nextSibling?.textContent).toBe("7");
    expect(within(dialog).getByText("Tu mejor batalla")).toBeTruthy();
    expect(within(dialog).getByText(/vs kael/)).toBeTruthy();
    expect(within(dialog).getByText("31%")).toBeTruthy();
    expect(within(dialog).getByText("58%")).toBeTruthy();
  });

  it("caso solo enfrentado: muestra resumen enfrentado y omite mejor batalla en el reverso", () => {
    renderModal({ cell: seenCell(HEATRAN), username: "jazar", isOwn: true });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Lo enfrentaste 4 veces · te hizo 3 KOs · le ganaste 3")).toBeTruthy();
    expect(within(dialog).queryByText("Tu mejor batalla")).toBeNull();
    expect(within(dialog).queryByText("Tus KOs")).toBeNull();
  });

  it("caso por evolución o sin stats: muestra texto sin batallas y omite números vacíos", () => {
    renderModal({ cell: evoCell(CHARMANDER, "Charizard"), username: "jazar", isOwn: true });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Sin batallas todavía")).toBeTruthy();
    expect(within(dialog).getByText("Descubierto al ver a Charizard")).toBeTruthy();
    expect(within(dialog).queryByText("Tus KOs")).toBeNull();

    st.playerStats = { isSuccess: true, isPending: false, data: { username: "jazar", species: [] } };
    renderModal({ cell: seenCell(HEATRAN), username: "jazar", isOwn: true });
    expect(screen.getAllByText("Sin batallas todavía").length).toBeGreaterThanOrEqual(1);
  });

  it("pokédex de otro jugador: usa stats del jugador y textos Su/Sus", () => {
    renderModal({ cell: seenCell(CHARIZARD), username: "kael", isOwn: false });
    const dialog = screen.getByRole("dialog");
    expect(st.playerStatsUser).toBe("kael");
    expect(within(dialog).getByText("Sus KOs")).toBeTruthy();
    expect(within(dialog).getByText("Su MVP")).toBeTruthy();
    expect(within(dialog).getByText("Sus batallas")).toBeTruthy();
    expect(within(dialog).getByText("Su Charizard")).toBeTruthy();
    expect(within(dialog).getByText("Su mejor batalla")).toBeTruthy();
    expect(within(dialog).getByText("Toca para ver su historia")).toBeTruthy();
    expect(within(dialog).queryByText("Tus KOs")).toBeNull();
  });

  it("la carta gira al hacer clic y con Enter, cambia aria-pressed y respeta prefers-reduced-motion", async () => {
    const user = userEvent.setup();
    const { rerender } = renderModal({ cell: seenCell(CHARIZARD), username: "jazar", isOwn: true });

    const btn = screen.getByRole("button", { name: "Toca para ver tu historia" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.querySelector(".transition-transform.duration-300")).toBeTruthy();

    await user.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(within(btn).getByText("Toca para ver el set")).toBeTruthy();

    btn.focus();
    await user.keyboard("{Enter}");
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce") || /min-width: (768|1024)px/.test(query),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    rerender(
      <MemoryRouter>
        <DexEntryModal cell={seenCell(CHARIZARD)} onClose={vi.fn()} username="jazar" isOwn />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Toca para ver tu historia" }).querySelector(".duration-300")).toBeNull();
  });

  afterEach(() => {
    restoreMatchMedia();
  });

  it("en teléfono Stats base empieza plegado y se despliega al tocarlo", async () => {
    mockViewport(false);
    const user = userEvent.setup();
    renderModal({ cell: seenCell(CHARIZARD), username: "jazar", isOwn: true });
    const dialog = screen.getByRole("dialog");
    const toggle = within(dialog).getByRole("button", { name: /Stats base/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(dialog).queryByText("Velocidad")).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(dialog).getByText("Velocidad")).toBeTruthy();
  });

  it("cierra al presionar Escape", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
