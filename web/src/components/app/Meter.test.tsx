import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Meter } from "./Meter";
import { mockReducedMotion, restoreMatchMedia } from "@/lib/test-utils";

const barra = () => screen.getByRole("meter").firstElementChild as HTMLElement;

describe("Meter", () => {
  // jsdom no trae matchMedia; Meter lo consulta para respetar reduced-motion.
  beforeEach(() => mockReducedMotion(false));
  afterEach(restoreMatchMedia);

  it("expone el valor con role=meter", () => {
    render(<Meter label="Win rate" value={40} />);
    expect(screen.getByRole("meter", { name: "Win rate" })).toHaveAttribute("aria-valuenow", "40");
  });

  it("desplaza la barra con transform según el porcentaje", () => {
    render(<Meter label="Win rate" value={40} />);
    expect(barra().style.transform).toBe("translateX(-60%)");
  });

  it("con motion normal anima con duration-300 ease-ios (≤300ms, no ease-out lento)", () => {
    mockReducedMotion(false);
    render(<Meter label="Win rate" value={40} />);
    expect(barra()).toHaveClass("transition-transform", "duration-300", "ease-ios");
    expect(barra()).not.toHaveClass("duration-500");
  });

  it("con reduced-motion no lleva clase de transición", () => {
    mockReducedMotion(true);
    render(<Meter label="Win rate" value={40} />);
    expect(barra().className).not.toMatch(/transition|duration-/);
  });
});
