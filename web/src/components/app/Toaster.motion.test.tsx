import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "./Toaster";
import { useToast } from "@/lib/toast";
import { mockReducedMotion, restoreMatchMedia } from "@/lib/test-utils";

function Disparador() {
  const { toast } = useToast();
  return <button onClick={() => toast({ title: "Guardado" })}>avisar</button>;
}

describe("Toaster · motion", () => {
  beforeEach(() => mockReducedMotion(false));
  afterEach(restoreMatchMedia);

  it("la entrada anima con un string `transform` (compositor), no con x/y/scale de JS", () => {
    render(<ToastProvider><Disparador /></ToastProvider>);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "avisar" })); });
    const aviso = screen.getByText("Guardado").closest<HTMLElement>("[data-toast]")!;
    expect(aviso.style.transform).toMatch(/translateY\(-12px\)\s*scale\(0\.96\)/);
  });
});
