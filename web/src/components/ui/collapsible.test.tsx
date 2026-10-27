import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

describe("Collapsible", () => {
  it("abrir y cerrar alterna aria-expanded y el panel", async () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Reglas</CollapsibleTrigger>
        <CollapsibleContent>Contenido</CollapsibleContent>
      </Collapsible>,
    );
    const trigger = screen.getByRole("button", { name: "Reglas" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Contenido")).toBeVisible();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("el panel anima la altura (var de Base UI) con curva iOS", () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Reglas</CollapsibleTrigger>
        <CollapsibleContent>Contenido</CollapsibleContent>
      </Collapsible>,
    );
    const panel = screen.getByText("Contenido");
    expect(panel).toHaveClass("transition-[height]", "duration-200", "ease-ios", "overflow-hidden");
    expect(panel.className).toMatch(/h-\(--collapsible-panel-height\)/);
    expect(panel.className).toMatch(/data-starting-style:h-0/);
    expect(panel.className).toMatch(/data-ending-style:h-0/);
  });
});
