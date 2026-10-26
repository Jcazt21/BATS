import { describe, expect, it } from "vitest";
import { TICK_CAPTION, TICK_FOOTNOTE } from "./chart";
import { leerFuente } from "@/styles/source";

const token = (nombre: string) => {
  const m = leerFuente("styles/tokens.css").match(new RegExp(`--${nombre}:\\s*([\\d.]+)rem`));
  return m ? parseFloat(m[1]) * 16 : NaN;
};

describe("tamaños de texto de los gráficos", () => {
  it("salen de los tokens de tipografía (rem → px), no de números sueltos", () => {
    expect(TICK_CAPTION).toBe(token("text-caption"));
    expect(TICK_FOOTNOTE).toBe(token("text-footnote"));
  });
});
