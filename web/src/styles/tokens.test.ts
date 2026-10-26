import { describe, expect, it } from "vitest";
import { leerFuente } from "./source";

const tokens = leerFuente("styles/tokens.css");

describe("tokens de motion", () => {
  it.each([
    ["--ease-out", /--ease-out:\s*cubic-bezier\(/],
    ["--ease-ios", /--ease-ios:\s*cubic-bezier\(0\.32,\s*0\.72,\s*0,\s*1\)/],
    ["--duration-fast", /--duration-fast:\s*120ms/],
    ["--duration-base", /--duration-base:\s*200ms/],
    ["--duration-slow", /--duration-slow:\s*300ms/],
  ])("define %s", (_name, re) => {
    expect(tokens).toMatch(re);
  });
});
