import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState, ErrorState, LoadingState } from "./States";

describe("States", () => {
  it("EmptyState muestra título, descripción y acción", () => {
    render(<EmptyState title="Sin votos" description="Aún nadie votó." action={<button>Votar</button>} />);
    expect(screen.getByRole("heading", { name: "Sin votos" })).toBeInTheDocument();
    expect(screen.getByText("Aún nadie votó.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Votar" })).toBeInTheDocument();
  });

  it("ErrorState es role=alert y reintenta", async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new Error("boom")} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("LoadingState es role=status, anuncia 'Cargando' y no deja ruido para lectores", () => {
    const { container } = render(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Cargando");
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-slot="skeleton"]:not([aria-hidden="true"])')).toHaveLength(0);
  });

  it("LoadingState acepta el número de filas", () => {
    const { container } = render(<LoadingState rows={4} />);
    expect(container.querySelectorAll("[data-loading-row]")).toHaveLength(4);
  });
});
