import { describe, expect, it } from "vitest";
import { cardBackgroundUrl } from "./card-backgrounds";
import { POKEMON_TYPES } from "./pokemon-types";

/** Todos los fondos posibles de un tipo (se recorre el rango del sorteo). */
const posibles = (t: (typeof POKEMON_TYPES)[number]) => new Set([0, 0.2, 0.34, 0.5, 0.67, 0.8, 0.999].map((r) => cardBackgroundUrl(t, r)));

describe("fondos de la ventana del artwork", () => {
  it("cada uno de los 18 tipos tiene fondos, y exactamente 3 posibles", () => {
    for (const t of POKEMON_TYPES) {
      const urls = posibles(t);
      expect(urls.size, t).toBe(3);
      for (const u of urls) expect(u, t).toMatch(/\.png$/);
    }
  });

  it("aunque la carpeta tenga más de 3 imágenes (hielo tiene 8), solo salen 3", () => {
    expect(posibles("ice").size).toBe(3);
    expect(posibles("grass").size).toBe(3);
  });

  it("Planta, Bicho y Normal comparten carpeta; el resto usa la suya", () => {
    for (const t of ["grass", "bug", "normal"] as const) expect(cardBackgroundUrl(t, 0), t).toMatch(/grass-bug-normal/);
    expect(cardBackgroundUrl("ice", 0)).toMatch(/\/ice\//);
    expect(cardBackgroundUrl("fire", 0)).toMatch(/\/fire\//);
  });

  it("el mismo sorteo da siempre el mismo fondo, y los extremos del rango son válidos", () => {
    expect(cardBackgroundUrl("ice", 0.4)).toBe(cardBackgroundUrl("ice", 0.4));
    expect(cardBackgroundUrl("ice", 0)).toBeDefined();
    expect(cardBackgroundUrl("ice", 0.9999999)).toBeDefined();
  });

  it("sin tipo no hay fondo", () => {
    expect(cardBackgroundUrl(undefined, 0.5)).toBeUndefined();
  });
});
