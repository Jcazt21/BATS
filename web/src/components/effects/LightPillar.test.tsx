import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import LightPillar from "./LightPillar";

// jsdom no tiene WebGL: un GL falso que acepta cualquier llamada y cuenta `loseContext`.
const lose = vi.fn();
const gl = new Proxy({} as Record<string, unknown>, {
  get(_t, k) {
    if (typeof k !== "string") return undefined;
    if (k === "getExtension") return () => ({ loseContext: lose });
    if (k === "getShaderParameter" || k === "getProgramParameter") return () => true;
    if (k === "isContextLost") return () => false;
    if (k.startsWith("create")) return () => ({});
    if (/^[A-Z][A-Z0-9_]+$/.test(k)) return 1;
    return () => undefined;
  },
});

class Observador { observe() {} disconnect() {} }

beforeEach(() => {
  lose.mockClear();
  vi.stubGlobal("ResizeObserver", Observador);
  vi.stubGlobal("IntersectionObserver", Observador);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((tipo: string) => (tipo === "webgl2" ? gl : null)) as never);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("LightPillar: ciclo de vida del contexto WebGL", () => {
  it("StrictMode remonta sobre el mismo canvas: no pierde el contexto mientras sigue en el DOM", () => {
    render(<StrictMode><LightPillar topColor="red" bottomColor="blue" /></StrictMode>);
    expect(lose).not.toHaveBeenCalled();
  });
  it("al desmontar de verdad libera el contexto", () => {
    const { unmount } = render(<LightPillar topColor="red" bottomColor="blue" />);
    unmount();
    expect(lose).toHaveBeenCalledTimes(1);
  });
});
