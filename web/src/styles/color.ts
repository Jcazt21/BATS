// Utilidades de color para los tests de tokens: leer `oklch(...)` del CSS y medir
// contraste. Solo se importa desde tests.

export type Oklch = { l: number; c: number; h: number; a: number };

/** Parsea `oklch(L C H)` o `oklch(L C H / A)`; null si no lo es. */
export function parseOklch(valor: string): Oklch | null {
  const m = valor.trim().match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { l: parseFloat(m[1]), c: parseFloat(m[2]), h: parseFloat(m[3]), a };
}

/** OKLCH → OKLab. */
export function aOklab({ l, c, h }: Oklch): [number, number, number] {
  const r = (h * Math.PI) / 180;
  return [l, c * Math.cos(r), c * Math.sin(r)];
}

/** OKLCH → sRGB lineal sin recortar (puede salirse de [0,1] si está fuera de gamut). */
function aRgbLineal(o: Oklch): [number, number, number] {
  const [L, a, b] = aOklab(o);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const recorta = (x: number) => Math.min(1, Math.max(0, x));

/** Luminancia relativa WCAG (el color se recorta al gamut sRGB, como hace el navegador). */
export function luminancia(o: Oklch): number {
  const [r, g, b] = aRgbLineal(o).map(recorta);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre dos colores opacos. */
export function contraste(a: Oklch, b: Oklch): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Distancia euclídea en OKLab: ≈ 0.02 es "apenas distinguible", ≥ 0.08 claramente distinto. */
export function distancia(a: Oklch, b: Oklch): number {
  const [x, y] = [aOklab(a), aOklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Compone `fg` (con alfa) sobre `bg` opaco, en OKLab, devolviendo un color opaco. */
export function sobre(fg: Oklch, bg: Oklch): Oklch {
  const [fl, fa, fb] = aOklab(fg);
  const [bl, ba, bb] = aOklab(bg);
  const mix = (f: number, b2: number) => f * fg.a + b2 * (1 - fg.a);
  const [L, A, B] = [mix(fl, bl), mix(fa, ba), mix(fb, bb)];
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360, a: 1 };
}

/**
 * Declaraciones `--x: valor` de las reglas con exactamente ese selector. `media` limita
 * a las reglas dentro de un `@media` cuyo encabezado contenga ese texto; sin `media`, solo
 * las de primer nivel. Si hay varias reglas con el selector, las fusiona (gana la última).
 */
export function variables(css: string, selector: string, media?: string): Record<string, string> {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  const recorre = (texto: string, enMedia: string | null) => {
    let i = 0;
    while (i < texto.length) {
      const abre = texto.indexOf("{", i);
      if (abre < 0) break;
      const cabecera = texto.slice(i, abre).trim();
      let prof = 1;
      let j = abre + 1;
      while (j < texto.length && prof > 0) {
        if (texto[j] === "{") prof++;
        else if (texto[j] === "}") prof--;
        j++;
      }
      const cuerpo = texto.slice(abre + 1, j - 1);
      if (cabecera.startsWith("@media")) recorre(cuerpo, cabecera);
      else if (
        cabecera.split(",").map((s) => s.trim()).includes(selector) &&
        (media === undefined ? enMedia === null : !!enMedia && enMedia.includes(media))
      ) {
        for (const d of cuerpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
      }
      i = j;
    }
  };
  recorre(sinComentarios, null);
  return out;
}
