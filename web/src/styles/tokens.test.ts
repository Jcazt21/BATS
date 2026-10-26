import { describe, expect, it } from "vitest";
import { leerFuente } from "./source";

const tokens = leerFuente("styles/tokens.css");

describe("tokens de motion", () => {
  it.each([
    ["--ease-out", /--ease-out:\s*cubic-bezier\(/],
    ["--ease-ios", /--ease-ios:\s*cubic-bezier\(0\.32,\s*0\.72,\s*0,\s*1\)/],
    ["--duration-fast", /--duration-fast:\s*120ms/],
    ["--duration-base", /--duration-base:\s*200ms/],
    ["--duration-slow", /--duration-slow:\s*300ms/],
  ])("define %s", (_name, re) => {
    expect(tokens).toMatch(re);
  });
});

// ── Paleta: contraste y neutros cálidos (F1) ──────────────────────────────────
import { contraste, parseOklch, variables, type Oklch } from "./color";
import { leerRaiz } from "./source";

type Tema = "claro" | "oscuro";
const TEMAS: [Tema, string][] = [["claro", ":root"], ["oscuro", ".dark"]];

/** Color de un token en un tema; las vars que referencian otra (`var(--x)`) se resuelven. */
function color(tema: Tema, nombre: string, fondo?: Oklch): Oklch {
  const base = variables(tokens, ":root");
  const vars = tema === "claro" ? base : { ...base, ...variables(tokens, ".dark") };
  let v = vars[nombre];
  for (let i = 0; v?.startsWith("var(") && i < 5; i++) v = vars[v.slice(4, -1).trim()];
  const c = v ? parseOklch(v) : null;
  if (!c) throw new Error(`${nombre} no es un oklch() en el tema ${tema}: ${v}`);
  if (c.a < 1 && !fondo) throw new Error(`${nombre} tiene alfa: pasa el fondo`);
  return c;
}

describe("contraste de texto sobre superficies (AA 4.5:1)", () => {
  const PARES: [string, string][] = [
    ["--foreground", "--background"],
    ["--card-foreground", "--card"],
    ["--muted-foreground", "--background"],
    ["--muted-foreground", "--card"],
    ["--popover-foreground", "--popover"],
    ["--secondary-foreground", "--secondary"],
    ["--accent-foreground", "--accent"],
  ];
  for (const [tema] of TEMAS) {
    it.each(PARES)(`${tema}: %s sobre %s`, (fg, bg) => {
      expect(contraste(color(tema, fg), color(tema, bg))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("neutros cálidos (sin el azul Apple, hue 264)", () => {
  const NEUTROS = ["--background", "--card", "--muted", "--secondary", "--accent", "--popover", "--sidebar", "--foreground", "--muted-foreground"];
  for (const [tema, sel] of TEMAS) {
    it.each(NEUTROS)(`${tema}: %s no usa hue 264`, (nombre) => {
      const c = parseOklch(variables(tokens, sel)[nombre]);
      expect(c, nombre).not.toBeNull();
      // Blanco puro (c=0) no tiene matiz; cualquier otro neutro debe ser cálido (hue 30–110).
      if (c!.c > 0) expect(c!.h).toBeGreaterThanOrEqual(30), expect(c!.h).toBeLessThanOrEqual(110);
    });
  }
  it("ninguna variable de color de tokens.css usa hue 264 (incluido prefers-contrast)", () => {
    const sinTipos = tokens.replace(/--type-[\w-]+:[^;]+;/g, "");
    expect(sinTipos).not.toMatch(/oklch\([^)]*\s264(\s|\))/);
  });
  it("los neutros de prefers-contrast: more también son cálidos", () => {
    for (const sel of [":root", ".dark"]) {
      const v = variables(tokens, sel, "prefers-contrast");
      expect(Object.keys(v).length).toBeGreaterThan(0);
      for (const valor of Object.values(v)) {
        const c = parseOklch(valor);
        if (c && c.c > 0) expect(c.h).not.toBe(264);
      }
    }
  });
});

describe("theme-color del navegador", () => {
  it("coincide con papel (claro) y grafito (oscuro), no con el gris Apple", () => {
    const html = leerRaiz("index.html");
    expect(html).not.toMatch(/#f2f2f7|#0b0b0d/i);
    expect(html).toMatch(/theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)"/i);
    expect(html).toMatch(/theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)"/i);
  });
});
