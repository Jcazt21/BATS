import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormDots } from "./FormDots";
import { streakLabel } from "@/lib/match-result";

describe("FormDots", () => {
  it("muestra cada resultado con su letra (no solo color), de la más vieja a la más nueva", () => {
    render(<FormDots form={["W", "L", "T"]} />);
    const forma = screen.getByRole("img", { name: "Forma: V, D, E" });
    expect(forma).toHaveTextContent("VDE");
  });

  it("sin batallas muestra un guion", () => {
    render(<FormDots form={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("streakLabel", () => {
  it("abrevia la racha", () => {
    expect(streakLabel({ type: "W", length: 3 })).toBe("3V");
    expect(streakLabel({ type: "T", length: 1 })).toBe("1E");
    expect(streakLabel({ type: "L", length: 2 })).toBe("2D");
    expect(streakLabel({ type: null, length: 0 })).toBe("—");
  });
});
