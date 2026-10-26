import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Group, GroupRow } from "./Group";

describe("Group", () => {
  it("renderiza título, filas y footer", () => {
    render(
      <Group title="Clasificación" footer="min. 3 batallas">
        <GroupRow title="Ash" />
      </Group>,
    );
    expect(screen.getByRole("heading", { name: "Clasificación" })).toBeInTheDocument();
    expect(screen.getByText("Ash")).toBeInTheDocument();
    expect(screen.getByText("min. 3 batallas")).toBeInTheDocument();
  });

  it("loading muestra skeleton en vez de los hijos (y conserva el título)", () => {
    render(
      <Group title="Clasificación" loading>
        <GroupRow title="Ash" />
      </Group>,
    );
    expect(screen.getByRole("heading", { name: "Clasificación" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Ash")).not.toBeInTheDocument();
  });

  it("loadingRows controla cuántas filas de skeleton", () => {
    const { container } = render(<Group loading loadingRows={5}><GroupRow title="x" /></Group>);
    expect(container.querySelectorAll("[data-loading-row]")).toHaveLength(5);
  });

  it("empty muestra EmptyState en vez de una lista vacía", () => {
    render(
      <Group empty={{ title: "Aún no hay partidas", description: "Juega una." }}>
        {null}
      </Group>,
    );
    expect(screen.getByRole("heading", { name: "Aún no hay partidas" })).toBeInTheDocument();
    expect(screen.getByText("Juega una.")).toBeInTheDocument();
  });

  it("loading manda sobre empty (no hay vacío falso mientras carga)", () => {
    render(<Group loading empty={{ title: "Aún no hay partidas" }}>{null}</Group>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay partidas")).not.toBeInTheDocument();
  });

  it("empty={false} (hay datos) muestra los hijos", () => {
    render(<Group empty={false}><GroupRow title="Ash" /></Group>);
    expect(screen.getByText("Ash")).toBeInTheDocument();
  });
});
