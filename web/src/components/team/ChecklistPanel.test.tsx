import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChecklistPanel, PendingDot } from "./ChecklistPanel";
import type { ChecklistRow } from "@/lib/api";

describe("ChecklistPanel", () => {
  it("una regla informativa que falla explica que se exige al batallar y no se pinta como error", () => {
    const rows: ChecklistRow[] = [
      { rule: "type_of_month", label: "Al menos 1 pokémon de tipo Ice", ok: false, names: [], blocking: false },
      { rule: "item_clause", label: "Sin objetos repetidos", ok: false, names: ["Leftovers"] },
    ];
    render(<ChecklistPanel rows={rows} />);
    expect(screen.getByText("Se exige al batallar, no al registrar")).toBeInTheDocument();
    expect(screen.getAllByText("No cumple")).toHaveLength(1);
    expect(screen.getByText("Informativa")).toBeInTheDocument();
  });

  it("el estado pendiente es un icono estático (sin animate-pulse)", () => {
    const { container } = render(<PendingDot />);
    expect(container.firstElementChild!.getAttribute("class")).not.toMatch(/animate-/);
  });

  it("al pasar de falla a cumple el icono se funde (150ms) en vez de saltar", () => {
    const fila = (ok: boolean): ChecklistRow[] => [{ rule: "item_clause", label: "Sin objetos repetidos", ok, names: [] }];
    const { rerender, container } = render(<ChecklistPanel rows={fila(false)} />);
    const antes = container.querySelector("[data-status-icon]")!;
    rerender(<ChecklistPanel rows={fila(true)} />);
    const despues = container.querySelector("[data-status-icon]")!;
    expect(despues).not.toBe(antes); // se remonta: reinicia el fundido
    expect(despues).toHaveClass("animate-in", "fade-in-0", "duration-150");
  });
});
