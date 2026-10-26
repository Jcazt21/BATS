import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeasonSelect } from "./SeasonSelect";
import { abrirMenu } from "@/lib/test-utils";

const seasons = [
  { season_id: 3, season_name: "Temporada 3", is_active: true },
  { season_id: 2, season_name: "Temporada 2", is_active: false },
];

describe("SeasonSelect", () => {
  it("el botón dice qué temporada está elegida", () => {
    render(<SeasonSelect seasons={seasons} value="active" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Temporada/ })).toHaveTextContent("Temporada 3");
  });

  it("muestra la activa, las anteriores y 'Todas' como opciones de radio", async () => {
    render(<SeasonSelect seasons={seasons} value="active" onChange={() => {}} />);
    await abrirMenu(screen.getByRole("button", { name: /Temporada/ }));
    expect(await screen.findByRole("menuitemradio", { name: /Temporada 3.*activa/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Temporada 2" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Todas las temporadas" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Temporada 3/ })).toBeChecked();
  });

  it("elegir una anterior llama a onChange con su id (número)", async () => {
    const onChange = vi.fn();
    render(<SeasonSelect seasons={seasons} value="active" onChange={onChange} />);
    await abrirMenu(screen.getByRole("button", { name: /Temporada/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Temporada 2" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("elegir 'Todas' llama a onChange('all')", async () => {
    const onChange = vi.fn();
    render(<SeasonSelect seasons={seasons} value="active" onChange={onChange} />);
    await abrirMenu(screen.getByRole("button", { name: /Temporada/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Todas las temporadas" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("allowAll={false} oculta 'Todas'", async () => {
    render(<SeasonSelect seasons={seasons} value="active" onChange={() => {}} allowAll={false} />);
    await abrirMenu(screen.getByRole("button", { name: /Temporada/ }));
    await screen.findByRole("menu");
    expect(screen.queryByRole("menuitemradio", { name: "Todas las temporadas" })).not.toBeInTheDocument();
  });

  it("el botón mide ≥44px (h-11)", () => {
    render(<SeasonSelect seasons={seasons} value="active" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Temporada/ })).toHaveClass("h-11");
  });
});
