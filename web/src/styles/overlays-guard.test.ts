import { describe, expect, it } from "vitest";
import { leerFuente } from "./source";

const ui = (n: string) => leerFuente(`components/ui/${n}.tsx`);

describe("motion de overlays (guarda de fuente)", () => {
  it("sheet: solo transiciona transform y opacidad, y sale más rápido de lo que entra", () => {
    const s = ui("sheet");
    expect(s).not.toMatch(/\btransition\s+duration/);
    expect(s).toMatch(/transition-\[transform,opacity\]/);
    expect(s).toMatch(/duration-300/);
    expect(s).toMatch(/data-ending-style:duration-200/);
  });

  it.each(["dialog", "alert-dialog"])("%s: la salida es más corta que la entrada", (nombre) => {
    const s = ui(nombre);
    expect(s).toMatch(/data-open:duration-200/);
    expect(s).toMatch(/data-closed:duration-1(00|20)/);
    expect(s).not.toMatch(/\bduration-150\b/);
  });

  it("tooltip: sin selectores de Radix (delayed-open) y sin animación si abre en grupo", () => {
    const s = ui("tooltip");
    expect(s).not.toMatch(/data-\[state=delayed-open\]/);
    expect(s).toMatch(/data-instant:duration-0/);
  });

  it("tabs: el indicador se desliza con transform y la curva de iOS", () => {
    const s = ui("tabs");
    expect(s).toMatch(/TabsPrimitive\.Indicator/);
    expect(s).toMatch(/ease-ios/);
    expect(s).not.toMatch(/transition-all/);
  });

  it("collapsible: anima la altura con la curva de iOS y respeta reduced-motion", () => {
    const s = ui("collapsible");
    expect(s).toMatch(/transition-\[height\]/);
    expect(s).toMatch(/ease-ios/);
    expect(s).toMatch(/motion-reduce:transition-none/);
  });

  it("chevron del checklist: gira con duration-200 ease-ios", () => {
    const s = leerFuente("components/builder/TeamBuilder.tsx");
    expect(s).toMatch(/ChevronUp className=\{cn\("transition-transform duration-200 ease-ios"/);
  });

  it.each(["HoldButton", "BranchedMenu"])("%s.css usa los tokens de motion, no curvas propias", (nombre) => {
    const css = leerFuente(`components/app/${nombre}.css`);
    expect(css).not.toMatch(/cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\)/);
    expect(css).toMatch(/var\(--ease-out\)/);
  });
});
