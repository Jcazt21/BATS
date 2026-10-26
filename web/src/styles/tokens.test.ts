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
import { contraste, distancia, parseOklch, sobre, variables, type Oklch } from "./color";
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
      if (c!.c > 0) {
        expect(c!.h).toBeGreaterThanOrEqual(30);
        expect(c!.h).toBeLessThanOrEqual(110);
      }
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

// ── Paleta: semánticos y gráficos (F2) ────────────────────────────────────────
describe("estados (success, warning, destructive, info)", () => {
  for (const [tema] of TEMAS) {
    for (const n of ["success", "warning", "destructive", "info"]) {
      it(`${tema}: ${n} se lee sobre su fondo suave (4.5:1)`, () => {
        expect(contraste(color(tema, `--${n}`), color(tema, `--${n}-soft`))).toBeGreaterThanOrEqual(4.5);
      });
      it(`${tema}: ${n} se ve sobre card como elemento de UI (3:1)`, () => {
        expect(contraste(color(tema, `--${n}`), color(tema, "--card"))).toBeGreaterThanOrEqual(3);
      });
    }
  }
  it("info es un azul apagado (c ≤ 0.09, hue 220–250) para no chocar con un mes de Agua", () => {
    for (const [tema] of TEMAS) {
      const c = color(tema, "--info");
      expect(c.c).toBeLessThanOrEqual(0.09);
      expect(c.h).toBeGreaterThanOrEqual(220);
      expect(c.h).toBeLessThanOrEqual(250);
    }
  });
});

describe("series de gráficos", () => {
  const SERIES = ["--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6"];
  it("chart-1 sigue al acento del mes", () => {
    expect(variables(tokens, ":root")["--chart-1"]).toBe("var(--primary)");
    expect(variables(tokens, ".dark")["--chart-1"]).toBe("var(--primary)");
  });
  for (const [tema] of TEMAS) {
    it.each(SERIES)(`${tema}: %s ≥ 3:1 sobre card`, (n) => {
      expect(contraste(color(tema, n), color(tema, "--card"))).toBeGreaterThanOrEqual(3);
    });
    it(`${tema}: las series 2–6 son distinguibles entre sí (OKLab ≥ 0.07)`, () => {
      for (let i = 0; i < SERIES.length; i++)
        for (let j = i + 1; j < SERIES.length; j++)
          expect(distancia(color(tema, SERIES[i]), color(tema, SERIES[j])), `${SERIES[i]} vs ${SERIES[j]}`).toBeGreaterThanOrEqual(0.07);
    });
    // PlayerAvatar: texto `chart-n` sobre `chart-n/15` (sobre card).
    it.each(SERIES)(`${tema}: avatar con %s ≥ 4.5:1`, (n) => {
      const c = color(tema, n);
      const tinte = sobre({ ...c, a: 0.15 }, color(tema, "--card"));
      expect(contraste(c, tinte)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// ── Paleta: acento dinámico por tipo del mes (F3) ─────────────────────────────
const TIPOS = [...tokens.matchAll(/--type-([a-z]+):/g)].map((m) => m[1]).filter((t, i, a) => a.indexOf(t) === i);
const bloqueTipo = (t: string) => variables(tokens, `[data-month-type="${t}"]`);

/** Acento (primary y su texto) de un mes en un tema: lo que `tokens.css` deriva de --month-*. */
function acento(tema: Tema, tipo: string | null) {
  const v = { ...variables(tokens, ":root"), ...(tipo ? bloqueTipo(tipo) : {}) };
  const l = parseFloat(v[`--month-l-${tema === "claro" ? "light" : "dark"}`]);
  const primary: Oklch = { l, c: parseFloat(v["--month-c"]), h: parseFloat(v["--month-h"]), a: 1 };
  let crudo = v[`--month-fg-${tema === "claro" ? "light" : "dark"}`];
  if (crudo.startsWith("var(")) crudo = v[crudo.slice(4, -1).trim()];
  const fg = parseOklch(crudo)!;
  return { primary, fg };
}

describe("acento del mes", () => {
  it("hay un bloque [data-month-type] por cada tipo (18)", () => {
    const nombres = [...tokens.matchAll(/\[data-month-type="([a-z]+)"\]\s*\{/g)].map((m) => m[1]).sort();
    expect(TIPOS).toHaveLength(18);
    expect(nombres).toEqual([...TIPOS].sort());
  });
  it("--primary, --ring y --sidebar-primary se derivan de --month-*", () => {
    const v = variables(tokens, ":root");
    expect(v["--primary"]).toBe("oklch(var(--month-l) var(--month-c) var(--month-h))");
    expect(v["--primary-foreground"]).toBe("var(--month-fg)");
    expect(v["--ring"]).toBe("var(--primary)");
    expect(v["--sidebar-primary"]).toBe("var(--primary)");
    expect(v["--sidebar-ring"]).toBe("var(--primary)");
    expect(v["--sidebar-primary-foreground"]).toBe("var(--month-fg)");
    // .dark no redefine el acento: lo hereda por --month-l / --month-fg.
    for (const n of ["--primary", "--primary-foreground", "--ring", "--sidebar-primary", "--sidebar-ring"])
      expect(variables(tokens, ".dark")[n], n).toBeUndefined();
  });
  it("sin atributo, el acento es la laca de Pokédex (hue ≈ 27)", () => {
    const { primary } = acento("claro", null);
    expect(primary.h).toBe(27);
    expect(primary.c).toBeGreaterThan(0.15);
  });
  for (const [tema] of TEMAS) {
    it.each([null, ...TIPOS])(`${tema}: acento %s cumple contraste`, (tipo) => {
      const { primary, fg } = acento(tema, tipo);
      const fondo = color(tema, "--background");
      expect(contraste(primary, fg), "primary/primary-foreground").toBeGreaterThanOrEqual(4.5);
      expect(contraste(primary, fondo), "primary/background (anillo de foco)").toBeGreaterThanOrEqual(3);
      expect(contraste(primary, color(tema, "--card")), "primary/card").toBeGreaterThanOrEqual(3);
    });
  }
  it("el texto sobre el acento es blanco o tinta (sin otros matices)", () => {
    for (const t of TIPOS) for (const [tema] of TEMAS) {
      const { fg } = acento(tema, t);
      expect([1, 0.16]).toContain(fg.l);
    }
  });
});

describe("avatar con el acento del mes (chart-1/15 sobre card)", () => {
  // El acento del mes no garantiza 4.5:1 sobre su propio tinte (los claros son L≈.6), así que
  // el tono 1 del avatar pinta las iniciales con `foreground` y solo el fondo toma el acento.
  it("el tono 1 de PlayerAvatar usa text-foreground", () => {
    expect(leerFuente("components/app/PlayerAvatar.tsx")).toMatch(/"bg-chart-1\/15 text-foreground"/);
  });
  for (const [tema] of TEMAS) {
    it.each([null, ...TIPOS])(`${tema}: iniciales sobre el tinte del acento %s ≥ 4.5:1`, (tipo) => {
      const { primary } = acento(tema, tipo);
      const tinte = sobre({ ...primary, a: 0.15 }, color(tema, "--card"));
      expect(contraste(color(tema, "--foreground"), tinte)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
