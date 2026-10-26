import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Reveal } from "./Reveal";

describe("Reveal", () => {
  it("al montar anima con fade corto", () => {
    render(<Reveal data-testid="r">hola</Reveal>);
    expect(screen.getByTestId("r")).toHaveClass("animate-in", "fade-in-0", "duration-200");
  });

  it("un refetch (mismas props, hijos nuevos) no lo remonta ni lo vuelve a animar", () => {
    const { rerender } = render(<Reveal data-testid="r">uno</Reveal>);
    const nodo = screen.getByTestId("r");
    rerender(<Reveal data-testid="r">dos</Reveal>);
    expect(screen.getByTestId("r")).toBe(nodo); // mismo nodo: la animación CSS no se reinicia
    expect(nodo).toHaveTextContent("dos");
  });

  it("acepta className y la conserva junto a la animación", () => {
    render(<Reveal data-testid="r" className="flex">x</Reveal>);
    expect(screen.getByTestId("r")).toHaveClass("flex", "animate-in");
  });
});
