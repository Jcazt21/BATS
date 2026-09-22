import { describe, expect, it, vi } from "vitest";
import { lazyPage } from "./preload";
import { pages, preloadRoute } from "@/routes";

describe("lazyPage", () => {
  it("descarga una sola vez aunque se precargue varias veces", async () => {
    const load = vi.fn(async () => ({ default: () => null }));
    const page = lazyPage(load);
    await Promise.all([page.preload(), page.preload()]);
    await page.preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reintenta tras un fallo de red en vez de cachear el error", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ default: () => null });
    const page = lazyPage(load);
    await expect(page.preload()).rejects.toThrow("offline");
    await expect(page.preload()).resolves.toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("preloadRoute", () => {
  it("elige el chunk por ruta, sin confundir listas con fichas", () => {
    const dex = vi.spyOn(pages.pokedex, "preload").mockResolvedValue({ default: () => null });
    const entry = vi.spyOn(pages.pokedexEntry, "preload").mockResolvedValue({ default: () => null });
    const layout = vi.spyOn(pages.adminLayout, "preload").mockResolvedValue({ default: () => null });
    const bot = vi.spyOn(pages.statsBot, "preload").mockResolvedValue({ default: () => null });

    preloadRoute("/pokedex/Pikachu");
    expect(entry).toHaveBeenCalledOnce();
    expect(dex).not.toHaveBeenCalled();

    preloadRoute("/admin/stats/bot");
    expect(layout).toHaveBeenCalledOnce();
    expect(bot).toHaveBeenCalledOnce();

    preloadRoute("/ruta-inexistente");
    vi.restoreAllMocks();
  });
});
