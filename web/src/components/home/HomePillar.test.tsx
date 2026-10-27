import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { HomePillar } from "./HomePillar";

const entorno = vi.hoisted(() => ({ valor: { dark: true, reducedMotion: false, saveData: false, coarse: false, webgl2: true } }));
vi.mock("@/lib/pillar", async (original) => ({ ...(await original<typeof import("@/lib/pillar")>()), leerEntorno: () => entorno.valor }));
vi.mock("@/components/effects/LightPillar", () => ({
  default: (p: { topColor: string; bottomColor: string; mixBlendMode?: string }) => <div data-testid="pilar" data-top={p.topColor} data-bottom={p.bottomColor} data-blend={p.mixBlendMode} />,
}));

const root = document.documentElement;
const acento = (v: string) => root.style.setProperty("--primary", v);

beforeEach(() => { entorno.valor = { dark: true, reducedMotion: false, saveData: false, coarse: false, webgl2: true }; acento("oklch(0.8 0.08 210)"); });
afterEach(() => { root.style.removeProperty("--primary"); delete root.dataset.monthType; });

describe("HomePillar", () => {
  it("siempre pinta el degradado estático y está oculto a lectores de pantalla", () => {
    entorno.valor = { ...entorno.valor, dark: false };
    const { container } = render(<HomePillar />);
    expect(screen.getByTestId("pilar-estatico")).toBeTruthy();
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
  it("es el fondo de toda la pantalla: fijo, detrás del contenido y sin recibir clics", () => {
    const { container } = render(<HomePillar />);
    const cls = container.firstElementChild?.className ?? "";
    for (const c of ["fixed", "inset-0", "-z-10", "pointer-events-none"]) expect(cls).toContain(c);
    expect(cls).not.toMatch(/\bh-\[/);
  });
  it("mezcla con screen en el contenedor enmascarado, no dentro de un grupo aislado", async () => {
    // Un mask-image aísla su subárbol: un `screen` interno mezclaría con nada y dejaría un
    // rectángulo negro. Por eso el blend va en el propio contenedor y el canvas va en normal.
    const { container } = render(<HomePillar />);
    const pilar = await screen.findByTestId("pilar");
    expect(container.firstElementChild?.className).toContain("mix-blend-screen");
    expect(pilar.dataset.blend).toBe("normal");
  });
  it.each([
    ["claro", { dark: false }], ["reduced-motion", { reducedMotion: true }], ["ahorro de datos", { saveData: true }],
    ["táctil", { coarse: true }], ["sin WebGL2", { webgl2: false }],
  ])("no monta el efecto en %s", async (_n, parche) => {
    entorno.valor = { ...entorno.valor, ...parche };
    render(<HomePillar />);
    await act(async () => {});
    expect(screen.queryByTestId("pilar")).toBeNull();
  });
  it("monta el efecto con los colores del acento del mes", async () => {
    render(<HomePillar />);
    const pilar = await screen.findByTestId("pilar");
    expect(pilar.dataset.top).toBe("oklch(0.5 0.14 210)");
    expect(pilar.dataset.bottom).toMatch(/ 210\)$/);
  });
  it("recalcula los colores cuando cambia data-month-type", async () => {
    render(<HomePillar />);
    await screen.findByTestId("pilar");
    await act(async () => { acento("oklch(0.7 0.18 40)"); root.dataset.monthType = "fire"; });
    expect((await screen.findByTestId("pilar")).dataset.top).toBe("oklch(0.5 0.18 40)");
  });
  it("sin acento legible no monta el efecto", async () => {
    acento("");
    render(<HomePillar />);
    await act(async () => {});
    expect(screen.queryByTestId("pilar")).toBeNull();
  });
});
