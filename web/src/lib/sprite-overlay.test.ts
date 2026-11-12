import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("@/lib/http", () => ({ request: (...a: unknown[]) => request(...a), apiUrl: (p: string) => p }));

import { resolveOverlaySprite } from "./sprite-overlay";

/** `Image` falso: jsdom no carga imágenes. `ok` decide si dispara onload u onerror. */
function stubImage(ok: boolean) {
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) { queueMicrotask(() => (ok ? this.onload : this.onerror)?.()); }
  });
}

describe("resolveOverlaySprite (consume el API de BATS)", () => {
  beforeEach(() => { request.mockReset(); stubImage(true); });
  afterEach(() => vi.unstubAllGlobals());

  it("especie con animación: pide /info y usa el GIF con su tamaño", async () => {
    request.mockResolvedValue({ animated: true, width: 92, height: 82 });
    const s = await resolveOverlaySprite("scizor-mega", { animate: true });
    expect(request).toHaveBeenCalledWith("/api/sprites/scizor-mega/info?style=3d");
    expect(s).toEqual({ url: "/api/sprites/scizor-mega?style=3d", w: 92, h: 82, animated: true, pixelated: false });
  });

  it("especie sin animación: usa el PNG estático (?still=1) y su tamaño", async () => {
    request.mockResolvedValue({ animated: false, width: 120, height: 120 });
    const s = await resolveOverlaySprite("ogerpon", { animate: true });
    expect(s).toEqual({ url: "/api/sprites/ogerpon?style=3d&still=1", w: 120, h: 120, animated: false, pixelated: false });
  });

  it("estilo gen5: pide ese estilo y marca el pixel art", async () => {
    request.mockResolvedValue({ animated: true, width: 92, height: 82 });
    const s = await resolveOverlaySprite("scizor-mega", { animate: true, style: "gen5" });
    expect(request).toHaveBeenCalledWith("/api/sprites/scizor-mega/info?style=gen5");
    expect(s).toEqual({ url: "/api/sprites/scizor-mega?style=gen5", w: 92, h: 82, animated: true, pixelated: true });
  });

  it("con reducir movimiento ni consulta /info: va directo al PNG", async () => {
    const s = await resolveOverlaySprite("weavile", { animate: false });
    expect(request).not.toHaveBeenCalled();
    expect(s).toEqual({ url: "/api/sprites/weavile?style=3d&still=1", w: 120, h: 120, animated: false, pixelated: false });
    expect((await resolveOverlaySprite("weavile", { animate: false, style: "gen5" }))?.w).toBe(96);
  });

  it("API caída o especie desconocida: null (la carta usa el artwork)", async () => {
    request.mockRejectedValue(new Error("404"));
    expect(await resolveOverlaySprite("missingno", { animate: true })).toBeNull();
  });

  it("si la imagen no carga: null", async () => {
    stubImage(false);
    request.mockResolvedValue({ animated: true, width: 50, height: 50 });
    expect(await resolveOverlaySprite("mimikyu-totem", { animate: true })).toBeNull();
  });

  it("cachea por especie y modo: la segunda vez no vuelve a pedir", async () => {
    request.mockResolvedValue({ animated: true, width: 75, height: 59 });
    await resolveOverlaySprite("tauros", { animate: true });
    await resolveOverlaySprite("tauros", { animate: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
