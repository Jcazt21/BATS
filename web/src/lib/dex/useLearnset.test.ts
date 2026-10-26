import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLearnsetsForTests } from "./learnsets";
import { useLearnset, useLearnsets } from "./useLearnset";

const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) }) as Response;

describe("useLearnset", () => {
  beforeEach(() => __resetLearnsetsForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("devuelve null mientras carga y luego el learnset", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(ok({ garchomp: ["earthquake"] }))));
    const { result } = renderHook(() => useLearnset("garchomp"));
    expect(result.current.learnset).toBeNull();
    await waitFor(() => expect(result.current.learnset).toEqual(["earthquake"]));
    expect(result.current.error).toBeNull();
  });

  it("un fetch rechazado expone el error y retry vuelve a pedir el bucket", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValue(ok({ garchomp: ["earthquake"] }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLearnset("garchomp"));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.learnset).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.learnset).toEqual(["earthquake"]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it("sin especie no hay nada que cargar", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLearnset(null));
    expect(result.current.learnset).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useLearnsets", () => {
  beforeEach(() => __resetLearnsetsForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("pending hasta que llegan todos y luego el mapa", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(ok({ garchomp: ["earthquake"] }))));
    const { result } = renderHook(() => useLearnsets(["garchomp"]));
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.map).toEqual({ garchomp: ["earthquake"] });
  });

  it("un fetch rechazado expone el error y retry vuelve a pedir", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValue(ok({ garchomp: ["earthquake"] }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLearnsets(["garchomp"]));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.pending).toBe(false);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.map).toEqual({ garchomp: ["earthquake"] }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });
});
