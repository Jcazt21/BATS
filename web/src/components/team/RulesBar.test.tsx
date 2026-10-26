import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChecklistRow } from "@/lib/api";
import type { RuleSeason } from "@/lib/dex/validate";
import { renderWithProviders } from "@/lib/test-utils";
import { RulesBar } from "./RulesBar";

const season: RuleSeason = { type_of_month: "Ice", restrictions: { required_generation: 5 } };
const rows = (over: Partial<Record<string, boolean>> = {}): ChecklistRow[] => [
  { rule: "required_generation", label: "Al menos 1 pokémon de la generación 5", ok: over.gen ?? false, names: [] },
  { rule: "type_of_month", label: "Al menos 1 pokémon de tipo Ice", ok: over.type ?? true, names: [], blocking: false },
  { rule: "item_clause", label: "Sin objetos repetidos", ok: true, names: [] },
];

describe("RulesBar", () => {
  it("el tipo del mes va primero y lleva el acento del mes", () => {
    renderWithProviders(<RulesBar rows={rows()} season={season} />);
    const items = within(screen.getAllByRole("list")[0]).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Tipo Ice");
    expect(items[0].firstElementChild).toHaveClass("type-ice");
  });

  it("el estado se dice con icono y texto, no solo color", () => {
    renderWithProviders(<RulesBar rows={rows()} season={season} />);
    const list = screen.getAllByRole("list")[0];
    expect(within(list).getByText(/Gen 5/)).toBeInTheDocument();
    expect(within(list).getByText(": Falta")).toBeInTheDocument();
    expect(list.querySelectorAll("[data-status-icon] svg")).toHaveLength(3);
  });

  it("solo el contador es una región viva, con N/M", () => {
    const { container } = renderWithProviders(<RulesBar rows={rows()} season={season} />);
    const live = container.querySelectorAll("[aria-live]");
    expect(live.length).toBeGreaterThan(0);
    for (const el of live) expect(el).toHaveAttribute("role", "status");
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("2/3");
  });

  it("una chip fallida con acción es un botón que pide el filtro; las cumplidas no son botones", async () => {
    const onAction = vi.fn();
    renderWithProviders(<RulesBar rows={rows()} season={season} onAction={onAction} />);
    const list = screen.getAllByRole("list")[0];
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    await userEvent.click(within(list).getByRole("button", { name: /Gen 5/ }));
    expect(onAction).toHaveBeenCalledWith({ gen: 5 });
  });

  it("móvil: un chip único abre la hoja con la lista completa y las acciones", async () => {
    const onAction = vi.fn();
    renderWithProviders(<RulesBar rows={rows()} season={season} onAction={onAction} sheetExtra={<p>Extra</p>} />);
    await userEvent.click(screen.getByRole("button", { name: /^Reglas/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Al menos 1 pokémon de la generación 5", { exact: false })).toBeInTheDocument();
    expect(within(sheet).getByText("Extra")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Buscar Gen 5" }));
    expect(onAction).toHaveBeenCalledWith({ gen: 5 });
  });

  it("la barra móvil queda sobre el TabBar (z-40) salvo en modo en línea", () => {
    const { container, rerender } = renderWithProviders(<RulesBar rows={rows()} season={season} />);
    const mobile = container.querySelector(".md\\:hidden")!;
    expect(mobile.className).toMatch(/fixed/);
    expect(mobile.className).toMatch(/z-40/);
    expect(mobile.className).toMatch(/bottom-\[calc\(3\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
    rerender(<RulesBar rows={rows()} season={season} inline />);
    expect(container.querySelector(".md\\:hidden")!.className).not.toMatch(/fixed/);
  });
});
