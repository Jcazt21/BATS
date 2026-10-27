/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Vitest vacía los .css importados (incluso con ?raw), así que las guardas de fuente
// leen del disco. Solo se importa desde tests: tsconfig no incluye tipos de node.
const SRC = join(process.cwd(), "src");

/** Contenido de un archivo bajo `src/` (ruta relativa a `src/`, con `/`). */
export function leerFuente(ruta: string): string {
  return readFileSync(join(SRC, ruta), "utf8");
}

/** Todos los .tsx/.css bajo `src/`, como `{ "/ruta/relativa": contenido }`. */
export function fuentes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entrada of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
    if (!entrada.isFile() || !/\.(tsx|css)$/.test(entrada.name)) continue;
    const abs = join(entrada.parentPath, entrada.name);
    out["/src/" + relative(SRC, abs).split(sep).join("/")] = readFileSync(abs, "utf8");
  }
  return out;
}

/** Contenido de un archivo relativo a la raíz de `web/` (package.json, vite.config.ts...). */
export function leerRaiz(ruta: string): string {
  return readFileSync(join(process.cwd(), ruta), "utf8");
}
