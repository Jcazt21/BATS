import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonCard } from "./MonCard";

vi.mock("@/lib/motion", async (orig) => ({ ...(await orig<typeof import("@/lib/motion")>()), useReducedMotion: () => true }));

describe("MonCard · reduced-motion", () => {
  it("la entrada es solo un fundido: sin desplazamiento vertical", () => {
    render(<ul><MonCard mon={{ name: "Dragonite" }} /></ul>);
    const li = screen.getByText("Dragonite").closest("li")!;
    expect(li.style.transform).not.toMatch(/translateY\((?!0)/);
  });
});
