import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leerFuente } from "./source";

const SRC = resolve(__dirname, "..");
const archivos = (dir: string) =>
  readdirSync(resolve(SRC, dir)).filter((f) => f.endsWith(".tsx") && !f.includes(".test.")).map((f) => `${dir}/${f}`);

const MESA = [
  ...archivos("components/builder"),
  "components/team/SlotBoard.tsx",
  "components/team/RulesBar.tsx",
  "components/team/TypeCoveragePanel.tsx",
  "components/team/MonActions.tsx",
];

describe("motion de la mesa del entrenador (guarda de fuente)", () => {
  it.each(MESA)("%s: sin transition-all, ease-in, scale(0) ni duraciones mayores a 300ms", (f) => {
    const src = leerFuente(f);
    expect(src).not.toMatch(/\btransition-all\b/);
    expect(src).not.toMatch(/\bease-in\b/);
    expect(src).not.toMatch(/\bscale-0\b|scale\(0\)/);
    for (const m of src.matchAll(/\bduration-(\d+)\b/g)) expect(Number(m[1]), `${f} duration-${m[1]}`).toBeLessThanOrEqual(300);
  });

  it("SlotBoard: los slots entran con fade + 4px y salen más rápido, con los resortes de lib/motion", () => {
    const src = leerFuente("components/team/SlotBoard.tsx");
    expect(src).toMatch(/AnimatePresence/);
    expect(src).toMatch(/layout="position"/);
    expect(src).toMatch(/initial=\{reduce \? \{ opacity: 0 \} : \{ opacity: 0, y: 4 \}\}/);
    expect(src).toMatch(/exit=\{reduce \? \{ opacity: 0 \} : \{ opacity: 0, y: -4 \}\}/);
    expect(src).toMatch(/spring\.snappy/);
    expect(src).toMatch(/duration: 0\.15/); // reduced-motion: solo fundido
    expect(src).not.toMatch(/\bstiffness\b|\bdamping\b/); // sin springs propios
  });

  it("SlotBoard: la selección transiciona por CSS (un layoutId frena la salida del slot) y los botones usan press", () => {
    const src = leerFuente("components/team/SlotBoard.tsx");
    expect(src).not.toMatch(/layoutId=/);
    expect(src).toMatch(/transition-shadow duration-200 ease-ios motion-reduce:transition-none/);
    expect(src).toMatch(/className="press /);
  });

  it("el editor no se anima al cambiar de slot (sin motion en TeamBuilder)", () => {
    const src = leerFuente("components/builder/TeamBuilder.tsx");
    expect(src).not.toMatch(/motion\/react|AnimatePresence|<motion\./);
  });

  it("no queda código muerto de la versión anterior", () => {
    for (const f of ["lib/queries.ts", "lib/api.ts"]) {
      const src = leerFuente(f);
      expect(src).not.toMatch(/useTeamChecklist|validateTeam|getActiveRules/);
    }
    expect(() => leerFuente("components/team/ChecklistPanel.tsx")).toThrow();
  });

  it("agregar y reemplazar también guardan borrador (clave con contexto)", () => {
    const src = leerFuente("pages/TeamPage.tsx");
    expect(src).toMatch(/draftKey=\{addKey\}/);
    expect(src).toMatch(/draftKey=\{swapKey\(swapping\.pokemon_id\)\}/);
  });
});
