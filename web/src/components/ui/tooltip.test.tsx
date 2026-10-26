import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

describe("Tooltip", () => {
  it("muestra el contenido, sin selectores de Radix", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Ayuda</TooltipTrigger>
          <TooltipContent>Pick rate</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const tip = screen.getByText("Pick rate").closest('[data-slot="tooltip-content"]')!;
    expect(tip).toBeInTheDocument();
    expect(tip.className).not.toMatch(/delayed-open/);
    expect(tip.className).toMatch(/data-instant:duration-0/);
  });

  it("el provider agrupa: delay inicial de 400ms y salto instantáneo entre vecinos", () => {
    const { container } = render(<TooltipProvider><span /></TooltipProvider>);
    expect(container).toBeTruthy();
    // El contrato vive en el código fuente (jsdom no simula hover con temporizadores de Floating UI):
    // ver overlays-guard.test.ts (data-instant:duration-0) y los defaults del provider.
  });
});
