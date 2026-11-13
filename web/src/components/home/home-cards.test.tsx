import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TrainerCard } from "./TrainerCard";
import { TeamCard } from "./TeamCard";
import { haceCuanto } from "@/lib/format";
import { renderCardImage } from "@/lib/card-image";
import { resolveOverlaySprite } from "@/lib/sprite-overlay";
import { artworkUrl, cardColor, cardMid, cardTint, spritePath, typeColor, typeIconUrl, typeTint, TYPE_HUE, TYPE_ID, POKEMON_TYPES } from "@/lib/pokemon-types";
import { contraste, parseOklch, type Oklch } from "@/styles/color";

// jsdom no tiene canvas: la imagen de la carta se simula.
vi.mock("@/lib/card-image", () => ({
  renderCardImage: vi.fn(() => Promise.resolve(null)),
  ART_WINDOW: { x: 37, y: 131, w: 430, h: 210 },
  CARD_SIZE: { w: 504, h: 704 },
  SPRITE_SCALE: 1.15,
  SPRITE_SATURATION: 1.3,
  SPRITE_OVERFLOW: 14,
}));
// Showdown no se consulta en tests: sin sprite por defecto.
vi.mock("@/lib/sprite-overlay", () => ({ resolveOverlaySprite: vi.fn(() => Promise.resolve(null)) }));

const pokemon = (id: number, name: string, types: string | null) => ({
  pokemon_id: id, name, types, sprite_url: null, held_item: null, ability: null, nature: null, tera_type: null,
  moves: [], evs: {}, ivs: {}, added_at: null, in_lineup: true,
});

describe("TrainerCard", () => {
  it("la marca de agua del puesto no se lee con lector de pantalla", () => {
    const { container } = render(<TrainerCard username="jazar" rank={2} totalPlayers={12} />);
    const wm = container.querySelector('span[aria-hidden="true"]:not(.grid)');
    expect(wm).toHaveTextContent("#2");
  });

  it("sin puesto no pinta marca de agua ni chip de ranking", () => {
    const { container } = render(<TrainerCard username="jazar" rank={null} />);
    expect(container).not.toHaveTextContent("#");
  });

  it("un usuario largo se corta con puntos suspensivos y conserva el nombre completo", () => {
    const largo = "a".repeat(40);
    render(<TrainerCard username={largo} rank={1} />);
    const h = screen.getByRole("heading", { name: largo });
    expect(h.className).toMatch(/truncate/);
    expect(h).toHaveAttribute("title", largo);
  });

  it("insignias: ganada normal, bloqueada con aviso", () => {
    render(<TrainerCard username="x" profile={{
      username: "x", first_seen: null, last_seen: null,
      record: { battles: 1, wins: 1, losses: 0, ties: 0, win_rate_pct: 100, forfeits: 0, survivors: 0 },
      mvp: { total: 0, kills: 0 }, streak: { type: null, length: 0 }, top_pokemon: [], recent: [], roster: null,
      badges: [
        { id: "first_win", glyph: "★", label: "Primera victoria", earned: true },
        { id: "streak_5", glyph: "5×", label: "Racha de 5 victorias", earned: false },
      ],
    }} />);
    expect(screen.getByRole("img", { name: "Primera victoria" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Racha de 5 victorias (bloqueada)" }).className).toMatch(/border-dashed/);
  });

  it("sin datos del perfil muestra guiones, no ceros inventados", () => {
    render(<TrainerCard username="x" />);
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});

describe("TeamCard", () => {
  const renderCard = (props = {}) =>
    render(<MemoryRouter><TeamCard pool={[pokemon(1, "Weavile", "Dark / Ice"), pokemon(2, "Mystery", null)]} dexNum={(s) => (s === "Weavile" ? 461 : undefined)} {...props} /></MemoryRouter>);

  it("expone nombre y tipos en español como texto, aunque la carta sea un canvas", () => {
    renderCard();
    expect(screen.getByText(/Weavile\. Siniestro, Hielo/)).toBeInTheDocument();
    expect(screen.getByText("Mystery")).toBeInTheDocument();
  });

  it("incluye objeto y habilidad cuando existen y los omite si no", () => {
    renderCard({ pool: [{ ...pokemon(1, "Weavile", "Dark / Ice"), held_item: "Choice Band", ability: "Pressure", moves: ["Knock Off", "Pursuit"] }, pokemon(2, "Mystery", null)] });
    expect(screen.getByText(/Weavile.*Choice Band.*Pressure.*Movimientos: Knock Off, Pursuit/)).toBeInTheDocument();
    expect(screen.getByText("Mystery")).toBeInTheDocument();
  });

  it("busca el sprite por el spriteid de la forma y, si lo hay, la textura no dibuja artwork", async () => {
    vi.mocked(resolveOverlaySprite).mockResolvedValueOnce({ url: "https://x/weavile.gif", w: 80, h: 70, animated: true, pixelated: false });
    renderCard({ pool: [pokemon(1, "Weavile", "Dark / Ice")], spriteId: (s: string) => (s === "Weavile" ? "weavile" : undefined) });
    await waitFor(() => expect(renderCardImage).toHaveBeenCalledWith(expect.objectContaining({ name: "Weavile", overlay: true })));
    expect(resolveOverlaySprite).toHaveBeenCalledWith("weavile", { animate: true });
  });

  it("sin sprite en Showdown, la textura conserva el artwork de reserva", async () => {
    renderCard({ pool: [pokemon(1, "Weavile", "Dark / Ice")], spriteId: () => "weavile" });
    await waitFor(() => expect(renderCardImage).toHaveBeenCalledWith(expect.objectContaining({ name: "Weavile", overlay: false })));
  });

  it("dibuja la imagen de cada carta con el dex, el objeto y la habilidad", async () => {
    renderCard({
      pool: [{ ...pokemon(1, "Weavile", "Dark / Ice"), held_item: "Choice Band", ability: "Pressure", moves: ["Knock Off", "Icicle Crash"] }],
      moveType: (m: string) => ({ "Knock Off": "Dark", "Icicle Crash": "Ice" })[m],
    });
    await waitFor(() => expect(renderCardImage).toHaveBeenCalledWith({
      name: "Weavile", types: "Dark / Ice", dexNum: 461, overlay: false, background: expect.stringMatching(/card-backgrounds\/dark\/.*\.png$/), heldItem: "Choice Band", ability: "Pressure", nature: null, evs: {},
      moves: [{ name: "Knock Off", type: "Dark" }, { name: "Icicle Crash", type: "Ice" }],
    }));
  });

  it("con alineación fijada muestra solo esos", () => {
    renderCard({ lineupSet: true, pool: [pokemon(1, "Weavile", "Dark"), { ...pokemon(2, "Banca", "Ice"), in_lineup: false }] });
    expect(screen.getByText(/Weavile/)).toBeInTheDocument();
    expect(screen.queryByText(/Banca/)).not.toBeInTheDocument();
  });

  it("no hay botón de editar ni de cambiar por slot", () => {
    renderCard();
    expect(screen.queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cambiar")).not.toBeInTheDocument();
  });
});

describe("pokemon-types · color y artwork", () => {
  it("hay un tono para cada tipo", () => {
    for (const t of POKEMON_TYPES) expect(TYPE_HUE[t], t).toBeTypeOf("number");
  });
  it("color y tinte salen del mismo tono con chroma y luminosidad fijos", () => {
    expect(typeColor("ice")).toBe("oklch(0.78 0.11 220)");
    expect(typeTint("dark")).toBe("oklch(0.26 0.04 20)");
  });
  it("cada tipo tiene un id de PokeAPI único (1–18) para su icono", () => {
    const ids = POKEMON_TYPES.map((t) => TYPE_ID[t]);
    expect(new Set(ids).size).toBe(POKEMON_TYPES.length);
    expect(Math.min(...ids)).toBe(1);
    expect(Math.max(...ids)).toBe(18);
    expect(typeIconUrl("fire")).toMatch(/scarlet-violet\/small\/10\.png$/);
  });
  it("el sprite Gen 5 se pide al API de BATS por spriteid (con `still` fuerza el estático)", () => {
    expect(spritePath("scizor-mega")).toBe("/api/sprites/scizor-mega");
    expect(spritePath("scizor-mega", { still: true })).toBe("/api/sprites/scizor-mega?still=1");
    expect(spritePath("scizor-mega", { style: "gen5", still: true })).toBe("/api/sprites/scizor-mega?style=gen5&still=1");
  });
  it("los colores de carta conservan el matiz del tipo y son más vivos que los de UI", () => {
    for (const t of POKEMON_TYPES) {
      for (const f of [cardColor, cardMid, cardTint]) expect(parseOklch(f(t))!.h, t).toBe(TYPE_HUE[t]);
      expect(parseOklch(cardColor(t))!.c).toBeGreaterThan(parseOklch(typeColor(t))!.c);
      expect(parseOklch(cardTint(t))!.c).toBeGreaterThan(parseOklch(typeTint(t))!.c);
    }
  });
  it("el texto de la carta mantiene contraste AA sobre cada tramo del degradado", () => {
    const blanco: Oklch = { l: 1, c: 0, h: 0, a: 1 };
    const tinta: Oklch = { l: 0.18, c: 0, h: 0, a: 1 }; // el #111 del nombre
    for (const t of POKEMON_TYPES) {
      expect(contraste(tinta, parseOklch(cardColor(t))!), `nombre sobre ${t}`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(blanco, parseOklch(cardMid(t))!), `blanco sobre medio ${t}`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(blanco, parseOklch(cardTint(t))!), `blanco sobre base ${t}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("artwork por número de dex", () => {
    expect(artworkUrl(998)).toMatch(/official-artwork\/998\.png$/);
  });
});

describe("haceCuanto", () => {
  const now = new Date(2031, 1, 8, 12);
  it("hoy, ayer y fecha corta", () => {
    expect(haceCuanto("2031-02-08", now)).toBe("hoy");
    expect(haceCuanto("2031-02-07", now)).toBe("ayer");
    expect(haceCuanto("2031-01-20T00:00:00", now)).not.toMatch(/hoy|ayer/);
    expect(haceCuanto(null, now)).toBe("—");
  });
});
