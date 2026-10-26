import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { mockReducedMotion, renderWithProviders, restoreMatchMedia } from "./test-utils";

function Probe() {
  const qc = useQueryClient();
  const loc = useLocation();
  return <p>{qc ? "qc" : "sin qc"}:{loc.pathname}</p>;
}

describe("test-utils", () => {
  afterEach(restoreMatchMedia);

  it("renderWithProviders envuelve en QueryClientProvider y MemoryRouter", () => {
    renderWithProviders(<Probe />, { route: "/equipo" });
    expect(screen.getByText("qc:/equipo")).toBeInTheDocument();
  });

  it("mockReducedMotion(true) hace que prefers-reduced-motion: reduce coincida", () => {
    mockReducedMotion(true);
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    expect(window.matchMedia("(min-width: 768px)").matches).toBe(false);
  });

  it("mockReducedMotion(false) no coincide", () => {
    mockReducedMotion(false);
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
  });
});
