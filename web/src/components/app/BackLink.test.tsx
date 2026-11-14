import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { BackLink } from "./BackLink";

function Ubicacion() {
  return <output data-testid="loc">{useLocation().pathname}</output>;
}
const montar = (entries: string[], index: number) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Routes>
        <Route path="/j/:u" element={<BackLink fallback="/stats">Estadísticas</BackLink>} />
        <Route path="*" element={<p>otra</p>} />
      </Routes>
      <Ubicacion />
    </MemoryRouter>,
  );

describe("BackLink", () => {
  it("si hay una página previa en la app vuelve a ella (no al fallback)", async () => {
    montar(["/stats/pokemon/Gengar", "/j/ash"], 1);
    await userEvent.click(screen.getByRole("link", { name: /Estadísticas/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/stats/pokemon/Gengar");
  });

  it("si se entró directo (sin historial) va al fallback", async () => {
    montar(["/j/ash"], 0);
    await userEvent.click(screen.getByRole("link", { name: /Estadísticas/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/stats");
  });

  it("sigue siendo un <a href> real hacia el fallback (clic medio / abrir en pestaña)", () => {
    montar(["/j/ash"], 0);
    expect(screen.getByRole("link", { name: /Estadísticas/ })).toHaveAttribute("href", "/stats");
  });
});
