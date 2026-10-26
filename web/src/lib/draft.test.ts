import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import type { BuilderMon } from "@/lib/dex/validate";

const mon: BuilderMon = { species: "Garchomp", moves: ["Earthquake"], evs: {}, ivs: {} };
const KEY = "bats:teambuilder:3:ash";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("draft", () => {
  it("guarda, carga y borra (ida y vuelta)", () => {
    saveDraft(KEY, [mon]);
    const d = loadDraft(KEY);
    expect(d?.team).toEqual([mon]);
    expect(Number.isNaN(Date.parse(d!.savedAt))).toBe(false);
    clearDraft(KEY);
    expect(loadDraft(KEY)).toBeNull();
  });

  it("sin nada guardado devuelve null", () => {
    expect(loadDraft(KEY)).toBeNull();
  });

  it("ignora JSON mal formado o con otra forma", () => {
    localStorage.setItem(KEY, "{no es json");
    expect(loadDraft(KEY)).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ savedAt: "x", team: "no" }));
    expect(loadDraft(KEY)).toBeNull();
  });

  it("descarta y borra un borrador con algún pokémon inválido", () => {
    const bad: unknown[] = [
      { species: "Garchomp", evs: {}, ivs: {} },
      { species: 5, moves: [], evs: {}, ivs: {} },
      { species: "Garchomp", moves: [1], evs: {}, ivs: {} },
      { species: "Garchomp", moves: [], evs: "x", ivs: {} },
      { species: "Garchomp", moves: [], evs: {}, ivs: [] },
      { species: "Garchomp", moves: [], evs: {}, ivs: {}, ability: 3 },
      null,
    ];
    for (const m of bad) {
      localStorage.setItem(KEY, JSON.stringify({ savedAt: "2026-01-01T00:00:00Z", team: [mon, m] }));
      expect(loadDraft(KEY)).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    }
  });

  it("acepta evs/ivs ausentes (por defecto {}) y campos opcionales nulos", () => {
    localStorage.setItem(KEY, JSON.stringify({
      savedAt: "2026-01-01T00:00:00Z", team: [{ species: "Garchomp", moves: ["Earthquake"], ability: null, nature: "Jolly" }],
    }));
    expect(loadDraft(KEY)?.team[0]).toMatchObject({ species: "Garchomp", evs: {}, ivs: {}, nature: "Jolly" });
  });

  it("un equipo vacío no deja borrador", () => {
    saveDraft(KEY, [mon]);
    saveDraft(KEY, []);
    expect(loadDraft(KEY)).toBeNull();
  });

  it("aguanta un localStorage que lanza", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(loadDraft(KEY)).toBeNull();
    expect(() => saveDraft(KEY, [mon])).not.toThrow();
    expect(() => clearDraft(KEY)).not.toThrow();
  });
});
