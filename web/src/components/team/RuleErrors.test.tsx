import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RuleErrors } from "./RuleErrors";

describe("RuleErrors", () => {
  it("no renderiza nada sin errores", () => {
    const { container } = render(<RuleErrors errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("es un alert con una lista (role=list), un ítem por error", () => {
    render(<RuleErrors title="Showdown encontró problemas" errors={["Dragonite: ilegal", "Gengar: ilegal"]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Showdown encontró problemas");
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("entra con un fundido corto de 150ms", () => {
    render(<RuleErrors errors={["x"]} />);
    expect(screen.getByRole("alert")).toHaveClass("animate-in", "fade-in-0", "duration-150");
  });

  it("ofrece 'Ir al set' solo en los errores accionables", async () => {
    const ir = vi.fn();
    render(<RuleErrors errors={["Dragonite: ilegal", "Equipo demasiado grande"]} target={(e) => (e.startsWith("Dragonite") ? ir : undefined)} />);
    const botones = screen.getAllByRole("button", { name: /Ir al set/ });
    expect(botones).toHaveLength(1);
    await userEvent.click(botones[0]);
    expect(ir).toHaveBeenCalledOnce();
  });
});
