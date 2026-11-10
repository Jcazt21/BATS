import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TrainerCard } from "./TrainerCard";
import { TeamCard } from "./TeamCard";
import { haceCuanto } from "@/lib/format";
import { artworkUrl, typeColor, typeTint, TYPE_HUE, POKEMON_TYPES } from "@/lib/pokemon-types";

const pokemon = (id: number, name: string, types: string | null) => ({
  pokemon_id: id, name, types, sprite_url: null, held_item: null, ability: null, nature: null, tera_type: null,
  moves: [], evs: {}, ivs: {}, added_at: null, in_lineup: true,
});

describe("TrainerCard", () => {
  it("la marca de agua del puesto no se lee con lector de pantalla", () => {
    const { container } = render(<TrainerCard username="jazar" rank={2} totalPlayers={12} />);
    const wm = container.querySelector('[aria-hidden="true"]:not(span.grid)');
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
      record: { battles: 1, wins: 1, losses: 0, win_rate_pct: 100, forfeits: 0, survivors: 0 },
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

  it("un chip por tipo, en español", () => {
    renderCard();
    expect(screen.getByText("Siniestro")).toBeInTheDocument();
    expect(screen.getByText("Hielo")).toBeInTheDocument();
  });

  it("usa el artwork oficial por número de dex y cae a iniciales si no hay número", () => {
    const { container } = renderCard();
    expect(container.querySelector("img")).toHaveAttribute("src", artworkUrl(461));
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByText("MY")).toBeInTheDocument();
  });

  it("si la imagen falla cae a iniciales", () => {
    const { container } = renderCard();
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("WE")).toBeInTheDocument();
  });

  it("con alineación fijada muestra solo esos", () => {
    renderCard({ lineupSet: true, pool: [pokemon(1, "Weavile", "Dark"), { ...pokemon(2, "Banca", "Ice"), in_lineup: false }] });
    expect(screen.getByText("Weavile")).toBeInTheDocument();
    expect(screen.queryByText("Banca")).not.toBeInTheDocument();
  });

  it("'Editar' lleva a /equipo y no hay botón de cambiar por slot", () => {
    renderCard();
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute("href", "/equipo");
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
