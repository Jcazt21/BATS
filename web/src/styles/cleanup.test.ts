import { describe, expect, it } from "vitest";
import { fuentes, leerRaiz } from "./source";

describe("limpieza de código muerto", () => {
  const rutas = Object.keys(fuentes());

  it("LandingPage y Scanner ya no existen", () => {
    expect(rutas.filter((r) => /LandingPage|Scanner/.test(r))).toEqual([]);
  });

  it("nada importa ogl ni los componentes borrados", () => {
    const usos = Object.entries(fuentes())
      .filter(([ruta, texto]) => !ruta.endsWith(".test.ts") && /from "ogl"|LandingPage|effects\/Scanner/.test(texto))
      .map(([ruta]) => ruta);
    expect(usos).toEqual([]);
  });

  it("la dependencia ogl salió de package.json", () => {
    const pkg = JSON.parse(leerRaiz("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).not.toHaveProperty("ogl");
  });

  it("ningún color suelto (#hex, rgb()) fuera de tokens.css y los logos de Google", () => {
    const BLANCA = ["/src/styles/tokens.css", "/src/components/SignInCard.tsx"];
    const sueltos = Object.entries(fuentes())
      .filter(([ruta]) => !BLANCA.includes(ruta) && !/\.test\.tsx?$/.test(ruta))
      .flatMap(([ruta, texto]) =>
        [...texto.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g)].map((m) => `${ruta}: ${m[0]}`));
    expect(sueltos).toEqual([]);
  });
});
