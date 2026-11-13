import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PokedexPage } from "./PokedexPage";

describe("PokedexPage", () => {
  it("muestra el encabezado Pokédex y el placeholder de colección por cuenta", () => {
    render(<MemoryRouter initialEntries={["/pokedex"]}><PokedexPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Pokédex" })).toBeInTheDocument();
    expect(screen.getByText("Próximamente: tu Pokédex por cuenta")).toBeInTheDocument();
  });
});
