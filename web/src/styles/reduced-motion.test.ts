import { describe, expect, it } from "vitest";
import { leerFuente } from "./source";

/** Extrae el cuerpo del primer `@media (prefers-reduced-motion: reduce) { … }` con llaves balanceadas. */
function bloqueReducedMotion(css: string): string {
  const inicio = css.indexOf("@media (prefers-reduced-motion: reduce)");
  if (inicio < 0) return "";
  let i = css.indexOf("{", inicio);
  const desde = i + 1;
  for (let nivel = 0; i < css.length; i++) {
    if (css[i] === "{") nivel++;
    else if (css[i] === "}" && --nivel === 0) return css.slice(desde, i);
  }
  return "";
}

describe("reduced-motion global", () => {
  const bloque = bloqueReducedMotion(leerFuente("styles/tokens.css"));

  it("existe el bloque", () => {
    expect(bloque).not.toBe("");
  });

  it("anula animaciones y no deja scroll suave", () => {
    expect(bloque).toMatch(/animation-duration:\s*0\.01ms/);
    expect(bloque).toMatch(/scroll-behavior:\s*auto/);
  });

  it("anula también las transiciones de transform", () => {
    expect(bloque).toMatch(/transition-property:\s*[^;]*(color|opacity)[^;]*;/);
    expect(bloque).not.toMatch(/transition-property:\s*[^;]*transform/);
  });

  it(".press no se encoge al pulsar", () => {
    expect(bloque).toMatch(/\.press:active\s*\{[^}]*transform:\s*none/);
  });

  it("animate-pulse y animate-spin no se mueven", () => {
    expect(bloque).toMatch(/\.animate-pulse[^{]*\{[^}]*animation:\s*none/);
    expect(bloque).toMatch(/\.animate-spin[^{]*\{[^}]*animation:\s*none/);
  });
});
