import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { abrirMenu } from "@/lib/test-utils";
import { ActionBar } from "./ActionBar";

function montar(over: Partial<React.ComponentProps<typeof ActionBar>> = {}) {
  const props = {
    blockers: [], busy: false, saveLabel: "Registrar equipo", onSave: vi.fn(), onJump: vi.fn(),
    onImport: vi.fn(), onCopy: vi.fn(), ...over,
  };
  render(<ActionBar {...props} />);
  return props;
}

describe("ActionBar", () => {
  it("sin bloqueos: el botón está activo y guarda", async () => {
    const p = montar();
    await userEvent.click(screen.getByRole("button", { name: "Registrar equipo" }));
    expect(p.onSave).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("save-blockers")).toBeNull();
  });

  it("con bloqueos: botón apagado y los motivos visibles en la misma barra", () => {
    montar({ blockers: [{ message: "Falta 1 Pokémon" }, { message: "Garchomp: 2 problemas en el set", target: { slot: 1 } }] });
    expect(screen.getByRole("button", { name: "Registrar equipo" })).toBeDisabled();
    const list = screen.getByTestId("save-blockers");
    expect(within(list).getByText("Falta 1 Pokémon")).toBeInTheDocument();
  });

  it("tocar un motivo con destino lleva a su causa; sin destino es solo texto", async () => {
    const p = montar({ blockers: [{ message: "Sin destino" }, { message: "Garchomp: 2 problemas", target: { slot: 1 } }] });
    expect(screen.queryByRole("button", { name: "Sin destino" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Garchomp: 2 problemas" }));
    expect(p.onJump).toHaveBeenCalledWith({ slot: 1 });
  });

  it("muestra hasta 3 motivos y cuenta el resto", () => {
    montar({ blockers: ["a", "b", "c", "d", "e"].map((message) => ({ message })) });
    expect(screen.getByText("y 2 más")).toBeInTheDocument();
  });

  it("Importar y Copiar viven en un menú de la barra", async () => {
    const p = montar();
    await abrirMenu(screen.getByRole("button", { name: "Importar o copiar equipo" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Importar/ }));
    expect(p.onImport).toHaveBeenCalledOnce();
    await abrirMenu(screen.getByRole("button", { name: "Importar o copiar equipo" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Copiar/ }));
    expect(p.onCopy).toHaveBeenCalledOnce();
  });

  it("un error del servidor se muestra en la barra como alerta", () => {
    montar({ error: "Te falta un pokémon de color red." });
    expect(screen.getByRole("alert")).toHaveTextContent("Te falta un pokémon de color red.");
  });

  it("guardando: botón deshabilitado con 'Guardando…'", () => {
    montar({ busy: true });
    expect(screen.getByRole("button", { name: /Guardando/ })).toBeDisabled();
  });

  it("en una hoja (inline) se pega al fondo de la hoja, sin offset del TabBar", () => {
    const { container } = render(
      <ActionBar blockers={[]} busy={false} saveLabel="x" onSave={vi.fn()} onJump={vi.fn()} onImport={vi.fn()} onCopy={vi.fn()} inline />,
    );
    expect(container.firstElementChild!.className).toMatch(/\bbottom-0\b/);
    expect(container.firstElementChild!.className).not.toMatch(/7\.25rem/);
  });
});
