import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MonthTheme } from "./MonthTheme";

let temporada: { data?: { type_of_month?: string | null } };
vi.mock("@/lib/queries", () => ({ useActiveSeason: () => temporada }));

const html = () => document.documentElement;

beforeEach(() => { delete html().dataset.monthType; localStorage.clear(); temporada = {}; });
afterEach(() => vi.restoreAllMocks());

describe("MonthTheme", () => {
  it("el tipo del mes de la temporada activa se refleja en <html data-month-type>", () => {
    temporada = { data: { type_of_month: "Ice" } };
    render(<MonthTheme />);
    expect(html().dataset.monthType).toBe("ice");
  });
  it.each([undefined, null, "", "Bogus"])("tipo %s → sin atributo", (t) => {
    temporada = { data: { type_of_month: t } };
    render(<MonthTheme />);
    expect(html().dataset.monthType).toBeUndefined();
  });
  it("sin temporada (sin datos) no pone atributo ni falla", () => {
    expect(() => render(<MonthTheme />)).not.toThrow();
    expect(html().dataset.monthType).toBeUndefined();
  });
  it("al desmontar se limpia el atributo", () => {
    temporada = { data: { type_of_month: "fire" } };
    const { unmount } = render(<MonthTheme />);
    unmount();
    expect(html().dataset.monthType).toBeUndefined();
  });
  it("guarda el último mes para el siguiente arranque", () => {
    temporada = { data: { type_of_month: "grass" } };
    render(<MonthTheme />);
    expect(localStorage.getItem("bats-month-type")).toBe("grass");
  });
  it("mientras carga conserva el mes guardado (no lo borra)", () => {
    html().dataset.monthType = "fire"; // lo puso aplicarMesGuardado() en main.tsx
    temporada = {};
    render(<MonthTheme />);
    expect(html().dataset.monthType).toBe("fire");
  });
  it("un localStorage que lanza no rompe el render", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    temporada = { data: { type_of_month: "ice" } };
    expect(() => render(<MonthTheme />)).not.toThrow();
    expect(html().dataset.monthType).toBe("ice");
  });
});
