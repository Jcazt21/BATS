import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BentoCurve } from "./BentoCurve";

const puntos = [{ label: "4 abr", value: 10 }, { label: "5 abr", value: 11 }, { label: "6 abr", value: 14 }];
const montar = (points = puntos) =>
  render(<BentoCurve ariaLabel="Batallas acumuladas" value="14" note="+18%" points={points} empty="Aún no hay batallas." />);
const trazo = (c: HTMLElement) => c.querySelector("path.bento-curve-line")?.getAttribute("d") ?? "";

describe("BentoCurve", () => {
  it("resume el último punto en su etiqueta y muestra cifra y nota", () => {
    montar();
    expect(screen.getByRole("img", { name: "Batallas acumuladas: 14 al 6 abr" })).toBeInTheDocument();
    expect(screen.getByText("14", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("+18%")).toBeInTheDocument();
  });

  it("sin puntos muestra el texto vacío y no dibuja la curva", () => {
    const { container } = montar([]);
    expect(screen.getByText("Aún no hay batallas.")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Batallas acumuladas: sin datos");
  });

  it("con un solo punto o valores constantes dibuja una línea sin NaN", () => {
    for (const pts of [[{ label: "a", value: 5 }], [{ label: "a", value: 5 }, { label: "b", value: 5 }]]) {
      const { container, unmount } = montar(pts);
      expect(trazo(container)).not.toMatch(/NaN|Infinity/);
      expect(trazo(container)).toMatch(/^M/);
      unmount();
    }
  });

  it("al pasar el cursor cambia a la cifra y fecha del punto más cercano, y al salir las restaura", () => {
    const { container } = montar();
    const plot = container.querySelector("svg")!.parentElement!;
    plot.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 50, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(plot, { clientX: 2 });
    expect(screen.getByText("4 abr")).toBeInTheDocument();
    expect(screen.getByText("10", { selector: "span" })).toBeInTheDocument();
    fireEvent.pointerLeave(plot);
    expect(screen.getByText("+18%")).toBeInTheDocument();
    expect(screen.getByText("14", { selector: "span" })).toBeInTheDocument();
  });
});
