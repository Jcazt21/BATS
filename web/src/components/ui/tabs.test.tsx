import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function montar() {
  return render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Tabla</TabsTrigger>
        <TabsTrigger value="b">MVP</TabsTrigger>
        <TabsTrigger value="c">Uso</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
      <TabsContent value="c">Panel C</TabsContent>
    </Tabs>,
  );
}

describe("Tabs", () => {
  it("expone tablist/tab/tabpanel y marca la pestaña activa", () => {
    montar();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Tabla" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel A");
  });

  it("las flechas del teclado cambian de pestaña", async () => {
    montar();
    screen.getByRole("tab", { name: "Tabla" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "MVP" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel B");
  });

  it("hay un indicador deslizante que se mueve entre pestañas con curva iOS", () => {
    const { container } = montar();
    const indicador = container.querySelector('[data-slot="tabs-indicator"]')!;
    expect(indicador).toBeInTheDocument();
    expect(indicador).toHaveClass("ease-ios", "motion-reduce:transition-none");
    expect(indicador.className).toMatch(/transition-\[translate,width\]/);
    // Sin `left-0` el indicador queda en su posición estática (tras las pestañas) y el translate parte de ahí.
    expect(indicador).toHaveClass("left-0");
  });
});
