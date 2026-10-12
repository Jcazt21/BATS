import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChecklistPanel } from "./ChecklistPanel";
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
});
