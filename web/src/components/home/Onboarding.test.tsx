import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Onboarding, ONBOARDING_KEY } from "./Onboarding";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("Onboarding", () => {
  it("la primera visita ve la bienvenida", () => {
    render(<Onboarding />);
    expect(screen.getByRole("region", { name: "Bienvenida" })).toBeInTheDocument();
  });

  it("al entenderlo se oculta y no vuelve en la siguiente visita", async () => {
    const { unmount } = render(<Onboarding />);
    await userEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("region", { name: "Bienvenida" })).not.toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeTruthy();
    unmount();
    render(<Onboarding />);
    expect(screen.queryByRole("region", { name: "Bienvenida" })).not.toBeInTheDocument();
  });

  it("si localStorage falla (modo privado) no rompe: se muestra y se puede cerrar", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    render(<Onboarding />);
    expect(screen.getByRole("region", { name: "Bienvenida" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("region", { name: "Bienvenida" })).not.toBeInTheDocument();
  });
});
