import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { GlobalSearch } from "./GlobalSearch";

vi.mock("@/lib/queries", () => ({
  useDexEssentials: () => ({ data: { species: {}, items: {}, meta: {} } }),
  useLeaderboard: () => ({ data: [{ username: "ash" }, { username: "misty" }] }),
}));
vi.mock("@/lib/dex/snapshot", async (orig) => ({
  ...(await orig<typeof import("@/lib/dex/snapshot")>()),
  searchSpecies: (_d: unknown, q: string) =>
    q.toLowerCase().startsWith("ge") ? [{ name: "Gengar" }, { name: "Geodude" }]
    : q.toLowerCase() === "gar" ? [{ name: "Gengar" }, { name: "Garchomp" }, { name: "Gardevoir" }] : [],
}));

function Ubicacion() { return <output data-testid="loc">{useLocation().pathname}</output>; }
const montar = () => render(<MemoryRouter><GlobalSearch /><input aria-label="otro campo" /><Ubicacion /></MemoryRouter>);

beforeEach(() => document.body.focus());

describe("GlobalSearch", () => {
  it("el botón 'Buscar' abre el buscador", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByRole("dialog", { name: "Buscar" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Buscar pokémon o jugador" })).toHaveFocus();
  });

  it("la tecla / lo abre desde cualquier parte…", async () => {
    montar();
    await userEvent.keyboard("/");
    expect(await screen.findByRole("dialog", { name: "Buscar" })).toBeInTheDocument();
  });

  it("…pero no si se está escribiendo en un campo", async () => {
    montar();
    screen.getByRole("textbox", { name: "otro campo" }).focus();
    await userEvent.keyboard("/");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("abierto con el teclado no anima su apertura; con el ratón sí", async () => {
    const { unmount } = montar();
    await userEvent.keyboard("/");
    expect((await screen.findByRole("dialog")).className).toMatch(/animate-none/);
    unmount();

    montar();
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect((await screen.findByRole("dialog")).className).not.toMatch(/animate-none/);
  });

  it("muestra pokémon y jugadores que coinciden, agrupados", async () => {
    montar();
    await userEvent.keyboard("/");
    await userEvent.type(await screen.findByRole("combobox"), "ge");
    const lista = screen.getByRole("listbox");
    expect(within(lista).getByRole("option", { name: /Gengar/ })).toBeInTheDocument();
    expect(within(lista).queryByRole("option", { name: /ash/ })).not.toBeInTheDocument();
  });

  it("los que empiezan por lo escrito van antes que los que solo lo contienen", async () => {
    montar();
    await userEvent.keyboard("/");
    await userEvent.type(await screen.findByRole("combobox"), "gar");
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent?.replace("Pokémon", ""))).toEqual(["Garchomp", "Gardevoir", "Gengar"]);
  });

  it("encuentra jugadores por nombre", async () => {
    montar();
    await userEvent.keyboard("/");
    await userEvent.type(await screen.findByRole("combobox"), "mis");
    expect(within(screen.getByRole("listbox")).getByRole("option", { name: /misty/ })).toBeInTheDocument();
  });

  it("elegir un pokémon navega a su ficha y cierra", async () => {
    montar();
    await userEvent.keyboard("/");
    await userEvent.type(await screen.findByRole("combobox"), "ge");
    await userEvent.click(screen.getByRole("option", { name: /Gengar/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/pokedex/Gengar");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con flechas y Enter se elige sin ratón", async () => {
    montar();
    await userEvent.keyboard("/");
    await userEvent.type(await screen.findByRole("combobox"), "ge");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("loc")).toHaveTextContent("/pokedex/Geodude");
  });

  it("sin coincidencias lo dice", async () => {
    montar();
    await userEvent.keyboard("/");
    await userEvent.type(await screen.findByRole("combobox"), "zzz");
    expect(screen.getByText(/Sin resultados/)).toBeInTheDocument();
  });

  it("Escape lo cierra", async () => {
    montar();
    await userEvent.keyboard("/");
    await screen.findByRole("dialog");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
