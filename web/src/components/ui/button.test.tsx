import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, buttonVariants } from "./button";

// jsdom no calcula layout: la hit-area de 44px se verifica por contrato de clases.
// Alto visual (h-7 = 28px, h-8 = 32px) + inset negativo del ::before a cada lado ≥ 44px.
const HIT_AREA: Record<string, RegExp> = {
  xs: /before:-inset-y-2\b/,        // 28 + 2×8 = 44
  sm: /before:-inset-y-1\.5\b/,     // 32 + 2×6 = 44
  "icon-xs": /before:-inset-2\b/,   // 28 + 2×8 = 44
  "icon-sm": /before:-inset-1\.5\b/, // 32 + 2×6 = 44
};

describe("Button · hit-area táctil", () => {
  it.each(Object.entries(HIT_AREA))("la variante %s extiende su área pulsable a 44px", (size, re) => {
    const cls = buttonVariants({ size: size as "xs" });
    expect(cls).toMatch(re);
    expect(cls).toMatch(/before:absolute/);
    expect(cls).toMatch(/\brelative\b/);
    expect(cls).toMatch(/before:content-\[''\]/);
  });

  it.each(["default", "lg", "icon", "icon-lg"] as const)("%s ya mide ≥40px y no necesita hit-area extra", (size) => {
    expect(buttonVariants({ size })).not.toMatch(/before:-inset/);
  });

  it("no cambia el tamaño visual (alto sigue en h-7)", () => {
    render(<Button size="xs">Quitar</Button>);
    expect(screen.getByRole("button", { name: "Quitar" })).toHaveClass("h-7");
  });
});
