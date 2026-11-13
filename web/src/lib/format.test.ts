import { describe, expect, it } from "vitest";
import { variacionSemanal } from "./format";

describe("variacionSemanal", () => {
  it("compara los últimos 7 días con los 7 previos", () => {
    expect(variacionSemanal(12, 10)).toBe("+20%");
    expect(variacionSemanal(2, 1)).toBe("+100%");
    expect(variacionSemanal(3, 4)).toBe("−25%");
    expect(variacionSemanal(5, 5)).toBe("+0%");
  });
  it("sin base previa, el conteo a secas", () => {
    expect(variacionSemanal(4, 0)).toBe("+4 esta semana");
  });
  it("sin actividad, vacío", () => {
    expect(variacionSemanal(0, 0)).toBe("");
    expect(variacionSemanal(undefined, undefined)).toBe("");
  });
});
