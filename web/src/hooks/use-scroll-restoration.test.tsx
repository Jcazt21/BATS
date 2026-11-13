import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate, type NavigateFunction } from "react-router-dom";
import { useScrollRestoration } from "./use-scroll-restoration";

let navigate: NavigateFunction;
function Probe() {
  useScrollRestoration();
  const nav = useNavigate();
  useEffect(() => {
    navigate = nav;
  }, [nav]);
  return null;
}

/** Simula el scroll de la ventana: jsdom no implementa scrollTo. */
function scrollWindow(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  window.dispatchEvent(new Event("scroll"));
}

describe("useScrollRestoration", () => {
  let scrollTo: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  });
  afterEach(() => scrollWindow(0));

  it("sube arriba al abrir otra página y restaura la posición al volver atrás", () => {
    render(<MemoryRouter initialEntries={["/stats"]}><Probe /></MemoryRouter>);
    scrollWindow(640);

    act(() => navigate("/j/ash"));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });

    act(() => navigate(-1));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: "instant" });
  });

  it("no mueve el scroll si solo cambia la query de la misma página", () => {
    render(<MemoryRouter initialEntries={["/pokedex"]}><Probe /></MemoryRouter>);
    scrollTo.mockClear();
    act(() => navigate("/pokedex?q=pika"));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("abrir y cerrar la ficha de la Pokédex (modal con URL) no mueve el scroll de la grilla", () => {
    render(<MemoryRouter initialEntries={["/pokedex"]}><Probe /></MemoryRouter>);
    scrollWindow(900);
    scrollTo.mockClear();
    act(() => navigate("/pokedex/charizard"));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => navigate("/j/ash/pokedex"));
    act(() => navigate("/j/ash/pokedex/pikachu"));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
