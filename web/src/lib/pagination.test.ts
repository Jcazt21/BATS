import { describe, expect, it } from "vitest";
import { clampPage, pageCount, pageWindow, paginate } from "./pagination";

describe("pageCount", () => {
  it("redondea hacia arriba y nunca baja de 1", () => {
    expect(pageCount(0, 30)).toBe(1);
    expect(pageCount(30, 30)).toBe(1);
    expect(pageCount(31, 30)).toBe(2);
    expect(pageCount(1025, 90)).toBe(12);
  });
});

describe("clampPage", () => {
  it("mantiene la página dentro de 1..total", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
  });
});

describe("paginate", () => {
  it("devuelve el tramo de la página pedida", () => {
    const items = Array.from({ length: 65 }, (_, i) => i + 1);
    expect(paginate(items, 1, 30)).toEqual(items.slice(0, 30));
    expect(paginate(items, 3, 30)).toEqual([61, 62, 63, 64, 65]);
  });
});

describe("pageWindow", () => {
  it("muestra todas las páginas cuando son pocas", () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("pone elipsis a los lados de la página actual", () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5, "gap", 12]);
    expect(pageWindow(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageWindow(12, 12)).toEqual([1, "gap", 8, 9, 10, 11, 12]);
  });
});
