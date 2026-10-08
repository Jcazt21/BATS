import { describe, expect, it } from "vitest";
import { BLOG_MAX_CHARS, MarkdownFileError, readMarkdownFile, stripLeadingTitle, titleFromMarkdown } from "./blog";

const md = (text: string, name = "nota.md") => new File([text], name, { type: "text/markdown" });

describe("titleFromMarkdown", () => {
  it("usa el primer encabezado de nivel 1", () => {
    expect(titleFromMarkdown("Intro\n\n# Temporada 4  \n\n## Bans", "x.md")).toBe("Temporada 4");
  });
  it("sin h1, usa el nombre del archivo legible", () => {
    expect(titleFromMarkdown("## Solo h2", "notas_del-parche.md")).toBe("notas del parche");
  });
});

describe("stripLeadingTitle", () => {
  it("quita el h1 inicial si repite el título", () => {
    expect(stripLeadingTitle("# Novedades\n\nTexto", "Novedades")).toBe("Texto");
  });
  it("deja el contenido intacto si el h1 es otro", () => {
    expect(stripLeadingTitle("# Otro\n\nTexto", "Novedades")).toBe("# Otro\n\nTexto");
  });
});

describe("readMarkdownFile", () => {
  it("lee título y contenido, sin BOM y con CRLF de Windows", async () => {
    const out = await readMarkdownFile(md("﻿# Hola liga\r\n\r\nTexto"));
    expect(out.title).toBe("Hola liga");
    expect(out.content.startsWith("#")).toBe(true);
    expect(out.content).not.toContain("\r");
  });
  it("quita el front matter YAML de Obsidian: no es contenido de la entrada", async () => {
    const out = await readMarkdownFile(md("---\nactualizado: 2026-10-07\ntags: [liga]\n---\n# Hola liga\n\nTexto"));
    expect(out.title).toBe("Hola liga");
    expect(out.content).toBe("# Hola liga\n\nTexto");
  });
  it("no toca un --- que no abre front matter", async () => {
    const out = await readMarkdownFile(md("# Hola\n\n---\n\nTexto"));
    expect(out.content).toBe("# Hola\n\n---\n\nTexto");
  });
  it("rechaza archivos que no son .md", async () => {
    await expect(readMarkdownFile(md("hola", "nota.txt"))).rejects.toBeInstanceOf(MarkdownFileError);
  });
  it("rechaza vacíos y demasiado grandes", async () => {
    await expect(readMarkdownFile(md("  \n"))).rejects.toThrow("vacío");
    await expect(readMarkdownFile(md("x".repeat(BLOG_MAX_CHARS + 1)))).rejects.toThrow("grande");
  });
});
