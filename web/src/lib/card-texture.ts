import type { PokemonType } from "@/lib/pokemon-types";

/**
 * Texturas abstractas de baja opacidad para el fondo de cada carta, una por tipo. Se dibujan con
 * trazos blancos u oscuros sobre el degradado del tipo; la opacidad nunca pasa de MAX_ALPHA para no
 * competir con el texto. Todo sale de un PRNG con semilla (el nombre), así la carta es determinista.
 */

/** Opacidad máxima de cualquier trazo. */
export const MAX_ALPHA = 0.14;

interface Rect { x: number; y: number; w: number; h: number }
type Rng = () => number;
type Pattern = (ctx: CanvasRenderingContext2D, r: Rect, rng: Rng) => void;

/** Semilla estable a partir de un texto (FNV-1a). */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

function stroke(ctx: CanvasRenderingContext2D, color: "white" | "black", alpha: number, width: number) {
  ctx.globalAlpha = Math.min(alpha, MAX_ALPHA);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
}

function fill(ctx: CanvasRenderingContext2D, color: "white" | "black", alpha: number) {
  ctx.globalAlpha = Math.min(alpha, MAX_ALPHA);
  ctx.fillStyle = color;
}

/** Agua: bandas sinusoidales apiladas. */
const waves: Pattern = (ctx, r, rng) => {
  const phase = rng() * Math.PI * 2;
  stroke(ctx, "white", 0.1, 3);
  for (let y = r.y - 10; y < r.y + r.h + 20; y += 44) {
    ctx.beginPath();
    for (let x = r.x; x <= r.x + r.w; x += 8) {
      const yy = y + Math.sin((x / 110) * Math.PI * 2 + phase + y / 90) * 12;
      if (x === r.x) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
};

/** Hielo: cristales (rombos) y líneas que se cruzan. */
const crystals: Pattern = (ctx, r, rng) => {
  stroke(ctx, "white", 0.1, 2);
  for (let i = 0; i < 16; i++) {
    const cx = r.x + rng() * r.w;
    const cy = r.y + rng() * r.h;
    const s = between(rng, 16, 64);
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 1.5);
    ctx.lineTo(cx + s, cy);
    ctx.lineTo(cx, cy + s * 1.5);
    ctx.lineTo(cx - s, cy);
    ctx.closePath();
    ctx.stroke();
  }
  stroke(ctx, "white", 0.06, 1.5);
  for (let i = 0; i < 6; i++) {
    const x = r.x + rng() * r.w;
    ctx.beginPath();
    ctx.moveTo(x, r.y);
    ctx.lineTo(x + between(rng, -160, 160), r.y + r.h);
    ctx.stroke();
  }
};

/** Fuego: brasas que suben, más densas abajo. */
const embers: Pattern = (ctx, r, rng) => {
  for (let i = 0; i < 70; i++) {
    const x = r.x + rng() * r.w;
    const y = r.y + (1 - rng() ** 2) * r.h; // sesgo hacia abajo
    fill(ctx, "white", between(rng, 0.06, 0.14));
    ctx.beginPath();
    ctx.arc(x, y, between(rng, 2, 9), 0, Math.PI * 2);
    ctx.fill();
  }
};

/** Eléctrico: zigzags tipo rayo. */
const sparks: Pattern = (ctx, r, rng) => {
  stroke(ctx, "white", 0.12, 3);
  for (let i = 0; i < 6; i++) {
    let x = r.x + rng() * r.w;
    let y = r.y + rng() * r.h * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < r.y + r.h) {
      y += between(rng, 24, 54);
      x += between(rng, -44, 44);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
};

/** Acero: malla hexagonal con algunas facetas rellenas. */
const hexes: Pattern = (ctx, r, rng) => {
  const s = 40;
  const dx = s * Math.sqrt(3);
  for (let row = -1; row * s * 1.5 < r.h + s * 2; row++) {
    for (let col = -1; col * dx < r.w + dx; col++) {
      const cx = r.x + col * dx + (row % 2 ? dx / 2 : 0);
      const cy = r.y + row * s * 1.5;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const px = cx + Math.cos(a) * s;
        const py = cy + Math.sin(a) * s;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      stroke(ctx, "white", 0.08, 2);
      ctx.stroke();
      if (rng() < 0.12) {
        fill(ctx, rng() < 0.5 ? "white" : "black", 0.07);
        ctx.fill();
      }
    }
  }
};

/** Roca y tierra: estratos horizontales con alguna grieta. */
const strata: Pattern = (ctx, r, rng) => {
  for (let y = r.y; y < r.y + r.h; y += between(rng, 26, 56)) {
    fill(ctx, rng() < 0.5 ? "black" : "white", 0.07);
    ctx.fillRect(r.x, y, r.w, between(rng, 6, 18));
  }
  stroke(ctx, "black", 0.1, 2.5);
  for (let i = 0; i < 4; i++) {
    let x = r.x + rng() * r.w;
    let y = r.y + rng() * r.h * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += between(rng, -26, 26);
      y += between(rng, 20, 44);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
};

/** Planta y bicho: hojas sueltas. */
const leaves: Pattern = (ctx, r, rng) => {
  for (let i = 0; i < 20; i++) {
    const s = between(rng, 26, 70);
    ctx.save();
    ctx.translate(r.x + rng() * r.w, r.y + rng() * r.h);
    ctx.rotate(rng() * Math.PI * 2);
    fill(ctx, "white", between(rng, 0.03, 0.06));
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.7, 0, 0, s);
    ctx.quadraticCurveTo(-s * 0.7, 0, 0, -s);
    ctx.fill();
    ctx.restore();
  }
};

/** Fantasma, veneno y siniestro: anillos concéntricos difusos, como humo o burbujas. */
const smoke: Pattern = (ctx, r, rng) => {
  stroke(ctx, "white", 0.07, 3);
  for (let i = 0; i < 12; i++) {
    const cx = r.x + rng() * r.w;
    const cy = r.y + rng() * r.h;
    const base = between(rng, 14, 40);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(cx, cy, base + k * 16, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
};

/** Psíquico y hada: estrellas de cuatro puntas y motas. */
const stars: Pattern = (ctx, r, rng) => {
  for (let i = 0; i < 26; i++) {
    const cx = r.x + rng() * r.w;
    const cy = r.y + rng() * r.h;
    const s = between(rng, 6, 30);
    fill(ctx, "white", between(rng, 0.08, 0.14));
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.quadraticCurveTo(cx, cy, cx + s, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy + s);
    ctx.quadraticCurveTo(cx, cy, cx - s, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy - s);
    ctx.fill();
  }
};

/** Volador y dragón: arcos solapados, como escamas o corrientes de aire. */
const scales: Pattern = (ctx, r) => {
  const s = 30;
  stroke(ctx, "white", 0.08, 2);
  for (let row = 0; row * s * 0.6 < r.h + s; row++) {
    for (let col = -1; col * s * 2 < r.w + s * 2; col++) {
      const cx = r.x + col * s * 2 + (row % 2 ? s : 0);
      const cy = r.y + row * s * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, s, 0, Math.PI);
      ctx.stroke();
    }
  }
};

/** Lucha: cuñas radiales que salen de un punto, como un impacto. */
const burst: Pattern = (ctx, r, rng) => {
  const cx = r.x + r.w * between(rng, 0.35, 0.65);
  const cy = r.y + r.h * 0.4;
  const rays = 16;
  const reach = Math.hypot(r.w, r.h);
  fill(ctx, "white", 0.06);
  for (let i = 0; i < rays; i += 2) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = ((i + 1) / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * reach, cy + Math.sin(a0) * reach);
    ctx.lineTo(cx + Math.cos(a1) * reach, cy + Math.sin(a1) * reach);
    ctx.closePath();
    ctx.fill();
  }
};

/** Normal: punteado suave. */
const dots: Pattern = (ctx, r, rng) => {
  fill(ctx, "white", 0.08);
  for (let y = r.y + 14; y < r.y + r.h; y += 30) {
    for (let x = r.x + 14; x < r.x + r.w; x += 30) {
      ctx.beginPath();
      ctx.arc(x + between(rng, -3, 3), y + between(rng, -3, 3), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

export const TYPE_TEXTURES: Record<PokemonType, Pattern> = {
  water: waves, ice: crystals, fire: embers, electric: sparks, steel: hexes,
  rock: strata, ground: strata, grass: leaves, bug: leaves,
  ghost: smoke, poison: smoke, dark: smoke, psychic: stars, fairy: stars,
  flying: scales, dragon: scales, fighting: burst, normal: dots,
};

/** Pinta la textura del tipo dentro de `r` (recortada a ese rectángulo) y deja el contexto como estaba. */
export function drawTypeTexture(ctx: CanvasRenderingContext2D, type: PokemonType, x: number, y: number, w: number, h: number, seed: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  TYPE_TEXTURES[type](ctx, { x, y, w, h }, mulberry32(seed));
  ctx.restore();
}
