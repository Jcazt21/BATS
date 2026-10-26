import { describe, expect, it } from "vitest";
import { fuentes } from "./source";

/**
 * Guarda de fuente: falla si reaparecen patrones de motion que rompen la sensación
 * de la app. Lee el código como texto (jsdom no puede medir fluidez; eso es P12).
 *
 * Los archivos fuera de alcance del rediseño se excluyen. Las violaciones pendientes
 * viven en EXCEPCIONES, una por archivo con su TODO; cada paquete elimina la suya.
 */
const sources = fuentes();

const FUERA_DE_ALCANCE = [
  /^\/src\/components\/ui\/sidebar\.tsx$/,
  /^\/src\/pages\/admin\//,
  /LandingPage/,
  /Scanner/,
  /\.test\.tsx?$/,
];

const PATRONES: [nombre: string, re: RegExp][] = [
  ["transition-all", /transition-all/],
  ["ease-in (no ease-in-out)", /\bease-in(?!-out)\b/],
  ["scale(0) / zoom-in-0", /scale\(0\)|zoom-in-0/],
  ["duración >300ms (duration-500+)", /\bduration-(500|700|1000)\b/],
];

/** archivo → patrones tolerados hasta que su paquete los corrija. */
const EXCEPCIONES: Record<string, string[]> = {
  // TODO(P1): Meter pasa a duration-300 ease-ios.
  "/src/components/app/Meter.tsx": ["duración >300ms (duration-500+)"],
};

describe("guarda de motion", () => {
  const archivos = Object.entries(sources).filter(([ruta]) => !FUERA_DE_ALCANCE.some((re) => re.test(ruta)));

  it("encuentra el código fuente", () => {
    expect(archivos.length).toBeGreaterThan(20);
  });

  it("no hay violaciones fuera de las excepciones declaradas", () => {
    const violaciones = archivos.flatMap(([ruta, texto]) =>
      PATRONES.filter(([nombre, re]) => re.test(texto) && !EXCEPCIONES[ruta]?.includes(nombre)).map(
        ([nombre]) => `${ruta}: ${nombre}`,
      ),
    );
    expect(violaciones).toEqual([]);
  });

  it("cada excepción sigue siendo una violación real (se borra al corregirla)", () => {
    const obsoletas = Object.entries(EXCEPCIONES).flatMap(([ruta, nombres]) =>
      nombres
        .filter((nombre) => {
          const re = PATRONES.find(([n]) => n === nombre)?.[1];
          return !re || !re.test(sources[ruta] ?? "");
        })
        .map((nombre) => `${ruta}: ${nombre}`),
    );
    expect(obsoletas).toEqual([]);
  });
});
