import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("es decorativo: aria-hidden", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const el = container.firstElementChild!;
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveClass("h-4", "w-20");
  });

  it("pulsa con el ciclo lento de Tailwind (2s) y se detiene con reduced-motion", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild!;
    expect(el).toHaveClass("animate-pulse", "motion-reduce:animate-none");
    // Sin override de duración: el ciclo por defecto (2s) es ≥1.5s.
    expect(el.className).not.toMatch(/\[animation-duration|duration-(75|100|150|200|300)/);
  });
});
