import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aplicarMes, aplicarMesGuardado, guardarMes, mesDeTipo } from "./month";

const html = () => document.documentElement;

beforeEach(() => { delete html().dataset.monthType; localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

describe("mesDeTipo", () => {
  it("normaliza mayúsculas y espacios", () => {
    expect(mesDeTipo("Ice")).toBe("ice");
    expect(mesDeTipo("  FIRE ")).toBe("fire");
  });
  it.each([null, undefined, "", "hielo", "unknown"])("%s → null", (v) => {
    expect(mesDeTipo(v)).toBeNull();
  });
});

describe("aplicarMes", () => {
  it("pone y quita data-month-type en <html>", () => {
    aplicarMes("ice");
    expect(html().dataset.monthType).toBe("ice");
    aplicarMes(null);
    expect(html().dataset.monthType).toBeUndefined();
  });
});

describe("persistencia del último mes", () => {
  it("aplicarMesGuardado aplica el valor guardado antes del primer render", () => {
    guardarMes("fire");
    aplicarMesGuardado();
    expect(html().dataset.monthType).toBe("fire");
  });
  it("sin valor guardado o con uno inválido no hace nada", () => {
    aplicarMesGuardado();
    expect(html().dataset.monthType).toBeUndefined();
    localStorage.setItem("bats-month-type", "basura");
    aplicarMesGuardado();
    expect(html().dataset.monthType).toBeUndefined();
  });
  it("guardarMes(null) borra el valor", () => {
    guardarMes("fire");
    guardarMes(null);
    expect(localStorage.getItem("bats-month-type")).toBeNull();
  });
  it("un localStorage que lanza no rompe nada", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(() => aplicarMesGuardado()).not.toThrow();
    expect(() => guardarMes("ice")).not.toThrow();
    expect(() => guardarMes(null)).not.toThrow();
    expect(html().dataset.monthType).toBeUndefined();
  });
});
