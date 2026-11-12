import { describe, expect, it } from "vitest";
import { MAX_ALPHA, TYPE_TEXTURES, drawTypeTexture, seedFrom } from "./card-texture";
import { POKEMON_TYPES } from "./pokemon-types";

/** Contexto falso: registra llamadas y asignaciones, y acumula los `globalAlpha` usados. */
function fakeCtx() {
  const log: string[] = [];
  const alphas: number[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) => (...args: unknown[]) => { log.push(`${prop}(${args.map((a) => (typeof a === "number" ? a.toFixed(3) : String(a))).join(",")})`); },
    set: (_t, prop: string, value: unknown) => {
      log.push(`${prop}=${String(value)}`);
      if (prop === "globalAlpha") alphas.push(value as number);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, alphas };
}

describe("texturas de carta por tipo", () => {
  it("hay una textura para cada tipo", () => {
    for (const t of POKEMON_TYPES) expect(TYPE_TEXTURES[t], t).toBeTypeOf("function");
  });

  it("ningún trazo pasa de la opacidad máxima", () => {
    for (const t of POKEMON_TYPES) {
      const { ctx, alphas } = fakeCtx();
      drawTypeTexture(ctx, t, 20, 20, 464, 664, seedFrom(t));
      expect(alphas.length, t).toBeGreaterThan(0);
      expect(Math.max(...alphas), t).toBeLessThanOrEqual(MAX_ALPHA);
    }
  });

  it("es determinista: misma semilla, mismo dibujo; otra semilla, otro", () => {
    const a = fakeCtx(); drawTypeTexture(a.ctx, "water", 0, 0, 400, 600, seedFrom("Tapu Fini"));
    const b = fakeCtx(); drawTypeTexture(b.ctx, "water", 0, 0, 400, 600, seedFrom("Tapu Fini"));
    const c = fakeCtx(); drawTypeTexture(c.ctx, "water", 0, 0, 400, 600, seedFrom("Kyurem-Black"));
    expect(a.log).toEqual(b.log);
    expect(a.log).not.toEqual(c.log);
  });

  it("recorta al rectángulo y restaura el contexto", () => {
    const { ctx, log } = fakeCtx();
    drawTypeTexture(ctx, "steel", 20, 20, 464, 664, 1);
    expect(log[0]).toBe("save()");
    expect(log).toContain("clip()");
    expect(log[log.length - 1]).toBe("restore()");
  });
});
