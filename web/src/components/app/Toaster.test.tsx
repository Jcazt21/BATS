import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "./Toaster";
import { useToast } from "@/lib/toast";
import { mockReducedMotion, restoreMatchMedia } from "@/lib/test-utils";

function Disparador({ tone }: { tone?: "error" }) {
  const { toast } = useToast();
  return <button onClick={() => toast({ title: "Guardado", description: "Equipo listo", tone })}>avisar</button>;
}

function montar(tone?: "error") {
  return render(<ToastProvider><Disparador tone={tone} /></ToastProvider>);
}
const avisar = () => act(() => { fireEvent.click(screen.getByRole("button", { name: "avisar" })); });

// El bucle de frames de motion captura requestAnimationFrame al importarse y no obedece a los
// timers falsos: aquí AnimatePresence/motion son transparentes y se prueba solo la lógica de
// temporizadores. La animación real se comprueba en Toaster.motion.test.tsx.
vi.mock("motion/react", async () => {
  const quitar = ["initial", "animate", "exit", "transition", "layout"];
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
      div: ({ children, ...props }: Record<string, unknown>) => {
        for (const k of quitar) delete props[k];
        return <div {...props}>{children as ReactNode}</div>;
      },
    },
    useReducedMotion: () => false,
  };
});

describe("Toaster", () => {
  beforeEach(() => {
    mockReducedMotion(false);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    restoreMatchMedia();
  });

  it("muestra el aviso en una región role=status", () => {
    montar();
    avisar();
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Guardado");
    expect(region).toHaveTextContent("Equipo listo");
  });

  it("apila como máximo 3 avisos (el más viejo cae)", async () => {
    montar();
    avisar(); avisar(); avisar(); avisar();
    expect(screen.getAllByText("Guardado")).toHaveLength(3);
  });

  it("se cierra solo a los 3.5s (6s si es error)", async () => {
    const { unmount } = montar();
    avisar();
    await act(() => vi.advanceTimersByTimeAsync(3400));
    expect(screen.queryByText("Guardado")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
    unmount();

    montar("error");
    avisar();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1800));
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
  });

  it("el temporizador se pausa con hover y se reanuda al salir", async () => {
    montar();
    avisar();
    const aviso = screen.getByText("Guardado").closest("[data-toast]")!;
    await act(() => vi.advanceTimersByTimeAsync(3000));
    fireEvent.pointerEnter(aviso);
    await act(() => vi.advanceTimersByTimeAsync(10_000)); // pasa mucho tiempo con el puntero encima
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    fireEvent.pointerLeave(aviso);
    await act(() => vi.advanceTimersByTimeAsync(400)); // quedaban ~500ms
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(800)); // vence + salida
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
  });

  it("el temporizador se pausa con el foco y se reanuda al perderlo", async () => {
    montar();
    avisar();
    const aviso = screen.getByText("Guardado").closest("[data-toast]")!;
    fireEvent.focus(aviso);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    fireEvent.blur(aviso);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
  });

  it("limpia los temporizadores al desmontar (nada pendiente)", () => {
    const { unmount } = montar();
    avisar();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
