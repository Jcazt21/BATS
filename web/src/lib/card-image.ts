import { artworkUrl, cardColor, cardMid, cardTint, isPokemonType, parseTypes, typeColor, typeIconUrl, typeLabel, type PokemonType } from "@/lib/pokemon-types";
import { initials } from "@/lib/format";
import { drawTypeTexture, seedFrom } from "@/lib/card-texture";

/** Lo que se imprime en la carta. */
export interface CardFace {
  name: string;
  types: string | null;
  dexNum?: number;
  /** El sprite lo pinta una capa `<img>` encima de la carta (ver SpriteOverlay): aquí no se dibuja artwork ni iniciales. */
  overlay?: boolean;
  /** URL (del mismo origen) de la imagen de fondo de la ventana del artwork. */
  background?: string;
  heldItem?: string | null;
  nature?: string | null;
  /** EVs por stat (claves como en Showdown: HP, Atk, Def, SpA, SpD, Spe). Solo se imprimen los distintos de cero. */
  evs?: Record<string, number>;
  ability?: string | null;
  /** Movimientos; `type` es el tipo del movimiento en inglés ("Ice") si se conoce. */
  moves?: { name: string; type?: string }[];
}

// 63:88, la proporción de una carta real; el shader redondea las esquinas, así que el lienzo va a sangre.
const W = 504;
const H = 704;
/** Resolución de dibujo: la carta se ve a ~300 px CSS (el doble en pantallas retina). */
const SCALE = 1.5;
const FRAME = 15; // 3 % del ancho: el borde plateado fino (HoloCard `frame={3}`).
const PAD = FRAME + 22;
const CHIP_Y = FRAME + 72;
const CHIP_H = 30;

/** Factor de tamaño del pokémon dentro de la ventana del artwork (sprite y artwork de reserva). */
export const SPRITE_SCALE = 1.15;
/** Cuánto puede sobresalir el sprite por encima de la ventana del artwork (sin llegar a la fila de chips de tipo). */
export const SPRITE_OVERFLOW = 14;
/** Saturación extra del sprite superpuesto (CSS `saturate`, solo a esa imagen; funciona también sobre el GIF animado). */
export const SPRITE_SATURATION = 1.3;

/** Tamaño del lienzo de la carta, en unidades de dibujo. */
export const CARD_SIZE = { w: W, h: H } as const;
/** Ventana del artwork en esas mismas unidades: SpriteOverlay coloca aquí el sprite animado. */
export const ART_WINDOW = { x: PAD, y: CHIP_Y + CHIP_H + 14, w: W - 2 * PAD, h: 210 } as const;
const FONT = '"Space Grotesk", system-ui, sans-serif';

const cache = new Map<string, Promise<string | null>>();

function loadBackground(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function loadArtwork(dexNum: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = artworkUrl(dexNum);
  });
}

const iconCache = new Map<PokemonType, Promise<HTMLImageElement | null>>();

/** Icono del tipo; `null` si no carga (el movimiento cae a un punto de color). */
function loadTypeIcon(type: PokemonType): Promise<HTMLImageElement | null> {
  let hit = iconCache.get(type);
  if (!hit) {
    hit = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = typeIconUrl(type);
    });
    iconCache.set(type, hit);
  }
  return hit;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Recorta con puntos suspensivos hasta que el texto quepa en `max` px. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Icono de tipo recortado en cuadrado redondeado. Fondo menos saturado: una capa gris en modo "saturation" quita ~15 % de color (el glifo blanco no cambia). */
function drawTypeIcon(ctx: CanvasRenderingContext2D, icon: HTMLImageElement, x: number, y: number, size: number, radius: number) {
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  ctx.drawImage(icon, x, y, size, size);
  ctx.globalCompositeOperation = "saturation";
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "gray";
  ctx.fillRect(x, y, size, size);
  ctx.restore();
}

async function draw(face: CardFace): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);

  // Las fuentes de la app cargan perezosas: sin esperarlas el nombre saldría en la de respaldo.
  await Promise.all([
    document.fonts?.load(`700 44px ${FONT}`),
    document.fonts?.load(`500 26px ${FONT}`),
  ].filter(Boolean)).catch(() => undefined);
  const art = !face.overlay && face.dexNum ? await loadArtwork(face.dexNum) : null;
  const background = face.background ? await loadBackground(face.background) : null;
  const moveTypes = [...new Set([
    ...parseTypes(face.types),
    ...(face.moves ?? []).map((m) => m.type?.toLowerCase()).filter((t): t is PokemonType => !!t && isPokemonType(t)),
  ])];
  const icons = new Map(await Promise.all(moveTypes.map(async (t) => [t, await loadTypeIcon(t)] as const)));

  const types = parseTypes(face.types);
  const first = types[0];

  // Borde plateado + fondo del tipo.
  ctx.fillStyle = "#d9dce2";
  ctx.fillRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, FRAME, W * 0.4, H);
  bg.addColorStop(0, first ? cardColor(first) : "#8b857c");
  bg.addColorStop(0.42, first ? cardMid(first) : "#5a554e");
  bg.addColorStop(1, first ? cardTint(first) : "#2a2622");
  ctx.fillStyle = bg;
  ctx.fillRect(FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME);
  if (first) drawTypeTexture(ctx, first, FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME, seedFrom(face.name));

  const pad = PAD;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const maxW = W - 2 * pad;

  // Cabecera: nombre con los iconos de tipo a su lado. A la izquierda: en el abanico lo que queda a la vista es ese lado.
  const chipH = CHIP_H;
  const chipY = CHIP_Y;
  const iconTypes = types.filter((t) => icons.get(t));
  const iconsW = iconTypes.length * (chipH + 8);
  ctx.fillStyle = "#111111";
  ctx.font = `700 44px ${FONT}`;
  const nameText = fit(ctx, face.name, maxW - iconsW);
  ctx.fillText(nameText, pad, FRAME + 56);
  let ix = pad + ctx.measureText(nameText).width + 14;
  for (const t of iconTypes) {
    // Centrado en vertical con las mayúsculas del nombre; el nombre del tipo queda en el texto accesible de la carta.
    drawTypeIcon(ctx, icons.get(t)!, ix, FRAME + 56 - 32 + 1, chipH, 8);
    ix += chipH + 8;
  }

  // Debajo: chips de texto solo para los tipos sin icono, y la naturaleza.
  ctx.font = `500 20px ${FONT}`;
  let x = pad;
  const chip = (label: string, fill: string, color: string) => {
    const w = ctx.measureText(label).width + 28;
    roundRect(ctx, x, chipY, w, chipH, chipH / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(label, x + w / 2, chipY + 21);
    ctx.textAlign = "left";
    x += w + 10;
  };
  for (const t of types) if (!icons.get(t)) chip(typeLabel(t), "rgba(17,17,17,0.82)", "#ffffff");
  if (face.nature) chip(face.nature, "rgba(0,0,0,0.25)", "rgba(255,255,255,0.92)");

  // Ventana del artwork.
  const { x: winX, y: winY, w: winW, h: winH } = ART_WINDOW;
  roundRect(ctx, winX, winY, winW, winH, 18);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  if (background) {
    // Imagen 16:9 en una ventana más baja (≈2,05:1): "cover" centrado; se recorta un poco arriba y abajo.
    const k = Math.max(winW / background.width, winH / background.height);
    ctx.save();
    roundRect(ctx, winX, winY, winW, winH, 18);
    ctx.clip();
    ctx.drawImage(background, winX + (winW - background.width * k) / 2, winY + (winH - background.height * k) / 2, background.width * k, background.height * k);
    // Velo suave para que el sprite (encima) siga destacando sobre cualquier fondo.
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(winX, winY, winW, winH);
    ctx.restore();
  }
  if (!face.overlay && art) {
    // Artwork oficial (reserva cuando no hay sprite pixel art): sin recorte, puede sobresalir un poco por arriba.
    const k = Math.min((winW - 4) / art.width, (winH + 4) / art.height) * SPRITE_SCALE;
    ctx.drawImage(art, winX + (winW - art.width * k) / 2, winY + winH - 6 - art.height * k, art.width * k, art.height * k);
  } else if (!face.overlay) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `700 80px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(initials(face.name), winX + winW / 2, winY + winH / 2 + 26);
    ctx.textAlign = "left";
  }

  // Objeto y habilidad: etiqueta pequeña + valor.
  let lineY = winY + winH + 38;
  for (const [label, value, strong] of [["OBJETO", face.heldItem, true], ["HABILIDAD", face.ability, false]] as const) {
    if (!value) continue;
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText(label, pad, lineY);
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.font = `${strong ? 700 : 500} 26px ${FONT}`;
    ctx.fillText(fit(ctx, value, maxW - 124), pad + 124, lineY);
    lineY += 36;
  }

  // Movimientos: panel oscuro con una fila por movimiento y un punto del color de su tipo.
  const moves = (face.moves ?? []).filter((m) => m.name).slice(0, 4);
  const evLine = Object.entries(face.evs ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}`)
    .join(" · ");
  if (moves.length) {
    // Con línea de EVs las filas se compactan para que quepa sin mover el resto de la carta.
    const rowH = evLine ? 50 : 56;
    const evH = evLine ? 30 : 0;
    const top = H - FRAME - 12 - rowH * moves.length - 14 - evH;
    roundRect(ctx, pad - 12, top, maxW + 24, rowH * moves.length + 14 + evH, 16);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fill();
    moves.forEach((m, i) => {
      const cy = top + 7 + rowH * i + rowH / 2;
      const type = m.type?.toLowerCase();
      const icon = type && isPokemonType(type) ? icons.get(type) : null;
      if (icon) {
        drawTypeIcon(ctx, icon, pad, cy - 14, 28, 6);
      } else {
        ctx.beginPath();
        ctx.arc(pad + 14, cy, 9, 0, Math.PI * 2);
        ctx.fillStyle = type && isPokemonType(type) ? typeColor(type) : "rgba(255,255,255,0.4)";
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `500 26px ${FONT}`;
      ctx.fillText(fit(ctx, m.name, maxW - 44), pad + 42, cy + 9);
    });
    if (evLine) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = `500 16px ${FONT}`;
      ctx.fillText(fit(ctx, `EVs  ${evLine}`, maxW), pad, top + 7 + rowH * moves.length + 22);
    }
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Dibuja la carta de un pokémon y devuelve la imagen (data URL) que usa HoloCard como textura.
 * `null` si no hay canvas (jsdom) o falla el dibujo; el resultado se cachea por contenido.
 */
export function renderCardImage(face: CardFace): Promise<string | null> {
  const key = JSON.stringify(face);
  let hit = cache.get(key);
  if (!hit) {
    hit = draw(face).catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}
