import { afterEach, describe, expect, it, vi } from "vitest";
import { colorDelMes, debeAnimar, leerEntorno, type Entorno } from "./pillar";

const base: Entorno = { dark: true, reducedMotion: false, saveData: false, coarse: false, webgl2: true };

describe("colorDelMes", () => {
  // El shader SUMA luz: con colores claros todo satura a blanco. Abajo va un tono oscuro y
  // vivo, arriba uno medio; ambos con el matiz del mes.
  it("conserva el matiz del acento; top es oscuro y bottom más claro", () => {
    const { top, bottom } = colorDelMes("oklch(0.8 0.08 210)")!;
    expect(top).toMatch(/^oklch\(0\.5 0\.14 210\)$/);
    expect(bottom).toMatch(/^oklch\(0\.78 0\.1 210\)$/);
  });
  it("un acento con croma alto lo mantiene (sin pasar de 0.2)", () => {
    expect(colorDelMes("oklch(0.7 0.18 27)")!.top).toBe("oklch(0.5 0.18 27)");
    expect(colorDelMes("oklch(0.7 0.3 27)")!.top).toBe("oklch(0.5 0.2 27)");
  });
  it("acepta alfa y espacios sobrantes", () => {
    expect(colorDelMes("  oklch(0.7 0.18 27 / 0.5) ")!.top).toBe("oklch(0.5 0.18 27)");
  });
  it.each(["", "red", "var(--primary)", "oklch(foo)"])("valor no reconocible %j → null", (v) => {
    expect(colorDelMes(v)).toBeNull();
  });
});

describe("debeAnimar", () => {
  it("el caso feliz: oscuro, con movimiento, WebGL2 y puntero fino", () => {
    expect(debeAnimar(base)).toBe(true);
  });
  it.each([
    ["tema claro", { dark: false }],
    ["prefers-reduced-motion", { reducedMotion: true }],
    ["ahorro de datos", { saveData: true }],
    ["táctil sin hover", { coarse: true }],
    ["sin WebGL2", { webgl2: false }],
  ])("no anima con %s", (_n, parche) => {
    expect(debeAnimar({ ...base, ...parche })).toBe(false);
  });
});

describe("leerEntorno", () => {
  afterEach(() => { vi.restoreAllMocks(); document.documentElement.classList.remove("dark"); });
  it("lee la clase dark y las media queries; jsdom no tiene WebGL2", () => {
    document.documentElement.classList.add("dark");
    vi.spyOn(window, "matchMedia").mockImplementation((q) => ({
      matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {},
    } as unknown as MediaQueryList));
    const e = leerEntorno();
    expect(e.dark).toBe(true);
    expect(e.reducedMotion).toBe(true);
    expect(e.webgl2).toBe(false);
  });
});
