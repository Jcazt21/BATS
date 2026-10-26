import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfflineNotice } from "./OfflineNotice";

function montar(qc = new QueryClient()) {
  return { qc, ...render(<QueryClientProvider client={qc}><OfflineNotice /></QueryClientProvider>) };
}
const conexion = (online: boolean) => {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
  act(() => { window.dispatchEvent(new Event(online ? "online" : "offline")); });
};

afterEach(() => vi.restoreAllMocks());

describe("OfflineNotice", () => {
  it("con conexión no muestra nada", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { container } = montar();
    expect(container).toBeEmptyDOMElement();
  });

  it("al perder la conexión muestra un ErrorState con 'Reintentar'", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    montar();
    conexion(false);
    expect(screen.getByRole("alert")).toHaveTextContent(/Sin conexión/);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("al volver la conexión desaparece y refresca los datos", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { qc } = montar();
    const refrescar = vi.spyOn(qc, "invalidateQueries");
    conexion(false);
    conexion(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(refrescar).toHaveBeenCalled();
  });

  it("'Reintentar' vuelve a pedir los datos", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { qc } = montar();
    conexion(false);
    const refrescar = vi.spyOn(qc, "invalidateQueries");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refrescar).toHaveBeenCalled();
  });
});
