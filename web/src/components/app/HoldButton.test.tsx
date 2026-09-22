import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import HoldButton from "./HoldButton";

describe("HoldButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom no trae ResizeObserver; el botón solo lo usa para medirse.
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("confirma solo tras mantenerlo el tiempo completo", () => {
    const onHold = vi.fn();
    render(<HoldButton holdTime={1000} onHold={onHold}>Mantén</HoldButton>);
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 1 });
    act(() => vi.advanceTimersByTime(500));
    expect(onHold).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(700));
    expect(onHold).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute("data-phase", "done");
  });

  it("soltar antes de tiempo cancela y cuenta como toque", () => {
    const onHold = vi.fn();
    const onTap = vi.fn();
    render(<HoldButton holdTime={1000} onHold={onHold} onTap={onTap}>Mantén</HoldButton>);
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 1 });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerUp(button, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(2000));

    expect(onHold).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute("data-phase", "idle");
  });

  it("perder el foco de la ventana a mitad cancela la confirmación", () => {
    const onHold = vi.fn();
    render(<HoldButton holdTime={1000} onHold={onHold}>Mantén</HoldButton>);
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 1 });
    act(() => vi.advanceTimersByTime(300));
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    act(() => vi.advanceTimersByTime(2000));

    expect(onHold).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("data-phase", "idle");
  });
});
