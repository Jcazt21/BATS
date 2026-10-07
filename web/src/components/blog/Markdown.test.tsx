import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Markdown } from "./Markdown";

const renderMd = (md: string) => render(<MemoryRouter><Markdown>{md}</Markdown></MemoryRouter>);

describe("Markdown", () => {
  it("baja un nivel los encabezados: la página ya tiene su h1", () => {
    renderMd("# Título\n\n## Sub");
    expect(screen.getByRole("heading", { level: 2, name: "Título" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Sub" })).toBeInTheDocument();
  });

  it("no pinta HTML crudo", () => {
    const { container } = renderMd('Hola\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Hola")).toBeInTheDocument();
  });

  it("neutraliza enlaces javascript:", () => {
    renderMd("[clic](javascript:alert(1))");
    expect(screen.getByText("clic").closest("a")?.getAttribute("href") ?? "").not.toMatch(/javascript/i);
  });

  it("enlaces externos en otra pestaña; internos sin target", () => {
    renderMd("[fuera](https://x.test) y [dentro](/stats)");
    const ext = screen.getByRole("link", { name: "fuera" });
    expect(ext).toHaveAttribute("target", "_blank");
    expect(ext).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "dentro" })).not.toHaveAttribute("target");
  });

  it("soporta GFM: tablas y listas de tareas", () => {
    renderMd("| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] hecho");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
