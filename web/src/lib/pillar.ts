/** Qué pasa con el pilar de luz del Home: colores derivados del mes y cuándo conviene animarlo. */

export interface Entorno {
  dark: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  /** Sin hover fino (táctil): el raymarching pesa demasiado en móvil. */
  coarse: boolean;
  webgl2: boolean;
}

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/[^)]*)?\)$/;
const redondea = (n: number) => +n.toFixed(3);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * `--primary` calculado → colores del pilar, con el matiz del mes. El shader SUMA luz: con
 * colores claros todo satura a blanco, así que abajo va un tono oscuro y vivo y arriba uno
 * medio (como el púrpura y rosa del original), y no el acento tal cual.
 */
export function colorDelMes(primary: string): { top: string; bottom: string } | null {
  const m = primary.trim().match(OKLCH);
  if (!m) return null;
  const c = parseFloat(m[2]);
  return {
    top: `oklch(0.5 ${redondea(clamp(c, 0.14, 0.2))} ${m[3]})`,
    bottom: `oklch(0.78 ${redondea(clamp(c, 0.1, 0.2))} ${m[3]})`,
  };
}

export const debeAnimar = (e: Entorno): boolean =>
  e.dark && !e.reducedMotion && !e.saveData && !e.coarse && e.webgl2;

let webgl2: boolean | undefined;
function tieneWebgl2(): boolean {
  if (webgl2 !== undefined) return webgl2;
  try {
    if (typeof WebGL2RenderingContext === "undefined") return (webgl2 = false);
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return (webgl2 = !!gl);
  } catch {
    return (webgl2 = false);
  }
}

export function leerEntorno(): Entorno {
  const mq = (q: string) => window.matchMedia(q).matches;
  const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    dark: document.documentElement.classList.contains("dark"),
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    saveData: !!conexion?.saveData,
    coarse: !mq("(hover: hover) and (pointer: fine)"),
    webgl2: tieneWebgl2(),
  };
}
