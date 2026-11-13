import { describe, expect, it } from "vitest";
import { leerFuente } from "./source";

/**
 * Tailwind 4 dejó los botones con `cursor: default` (en v3 eran `pointer`). index.css devuelve la
 * mano a todo lo que se pulsa, en toda la app, y no a lo deshabilitado.
 */
describe("cursor de los controles", () => {
  const css = leerFuente("index.css");
  const regla = css.match(/([^{}]*)\{\s*cursor:\s*pointer;\s*\}/)?.[1] ?? "";

  it("botones, select y controles con rol de botón muestran la mano", () => {
    for (const sel of ["button:not(:disabled)", "select:not(:disabled)", "summary", '[role="button"]', '[role="tab"]', '[role="radio"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="option"]']) {
      expect(regla).toContain(sel);
    }
  });
});
