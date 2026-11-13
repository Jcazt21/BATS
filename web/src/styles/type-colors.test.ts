import { describe, expect, it } from "vitest";
import { POKEMON_TYPES } from "@/lib/pokemon-types";
import { leerFuente } from "./source";

/**
 * Las etiquetas de tipo se arman en tiempo de ejecución (`type-${t}`), y Tailwind solo genera las
 * utilidades que ve escritas literalmente. Sin una lista explícita, solo tenían color los tipos que
 * por casualidad aparecían escritos en algún archivo (Hielo y Dragón, en dos tests).
 */
describe("colores de tipo", () => {
  const css = leerFuente("index.css");
  const inline = css.match(/@source inline\("type-\{([^}]*)\}"\);/);

  it("index.css obliga a Tailwind a generar type-<tipo> para los 18 tipos", () => {
    expect(inline).not.toBeNull();
    expect(new Set(inline![1].split(","))).toEqual(new Set(POKEMON_TYPES));
  });

  it("cada tipo tiene su utilidad definida en tokens.css", () => {
    const tokens = leerFuente("styles/tokens.css");
    for (const t of POKEMON_TYPES) expect(tokens).toMatch(new RegExp(`@utility type-${t}\\s*\\{`));
  });
});
