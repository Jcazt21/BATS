import { useEffect, useState } from "react";
import { CARD_RATIO } from "@/components/home/CardFan";
import HoloCard from "@/components/home/HoloCard";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { RosterPokemon } from "@/lib/api";
import { ART_WINDOW, CARD_SIZE, SPRITE_OVERFLOW, SPRITE_SATURATION, SPRITE_SCALE, renderCardImage } from "@/lib/card-image";
import { resolveOverlaySprite, type OverlaySprite } from "@/lib/sprite-overlay";
import { cardBackgroundUrl } from "@/lib/card-backgrounds";
import { parseTypes, typeLabel } from "@/lib/pokemon-types";

/**
 * Lo que la carta necesita de un pokémon. Un pokémon del roster lo cumple tal cual; la Pokédex arma
 * uno con el set más usado de la liga. `moves` debe ser estable entre renders (memoizado): es
 * dependencia del efecto que dibuja la carta.
 */
export type HoloPokemon = Pick<RosterPokemon, "name" | "types" | "held_item" | "ability" | "moves">;

/**
 * Sprite (3D o Gen 5, animado si existe) sobre la ventana del artwork. Es una `<img>` dentro de la cara de la
 * carta, así que se inclina con ella.
 */
function SpriteOverlay({ sprite, width }: { sprite: OverlaySprite; width: number }) {
  const unit = width / CARD_SIZE.w; // px CSS por unidad de dibujo
  // Escala (en unidades de dibujo) para llenar la ventana. El GIF viene recortado a lo opaco; el PNG estático lleva margen transparente.
  const fill = sprite.animated ? Math.min((ART_WINDOW.w - 8) / sprite.w, (ART_WINDOW.h + 4) / sprite.h) : (ART_WINDOW.h + 4) / sprite.h;
  // Pixel art: hasta 4× y en múltiplos enteros de píxel de pantalla (nítido). Renders 3D: suaves y sin pasar de 2× (más se ve borroso).
  let k = Math.min(fill, sprite.pixelated ? 4 : 2) * SPRITE_SCALE;
  k = Math.min(k, (ART_WINDOW.h + SPRITE_OVERFLOW) / sprite.h); // nunca sube hasta la fila de chips de tipo
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const px = sprite.pixelated ? Math.max(1, Math.floor(k * unit * dpr)) / dpr : k * unit;
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute flex items-end justify-center"
      style={{
        left: pct(ART_WINDOW.x, CARD_SIZE.w),
        top: pct(ART_WINDOW.y, CARD_SIZE.h),
        width: pct(ART_WINDOW.w, CARD_SIZE.w),
        height: pct(ART_WINDOW.h - 6, CARD_SIZE.h),
      }}
    >
      <img
        src={sprite.url}
        alt=""
        draggable={false}
        style={{
          width: sprite.w * px,
          height: sprite.h * px,
          maxWidth: "none",
          imageRendering: sprite.pixelated ? "pixelated" : undefined,
          filter: `saturate(${SPRITE_SATURATION}) drop-shadow(0 4px 5px oklch(0 0 0 / 0.35))`,
        }}
      />
    </div>
  );
}

/**
 * Una carta holográfica de un pokémon. La imagen se dibuja en un canvas (es la textura del shader);
 * mientras tanto, o si no hay canvas, queda un hueco de la misma proporción. El sprite va aparte, en una
 * `<img>` (Showdown no envía CORS, y un GIF no se anima dentro de un canvas). El texto de la carta va
 * también como texto real para lectores de pantalla.
 */
export function PokemonHolo({ pokemon: p, dexNum, sprite, moveType, width, idle = false }: { idle?: boolean; pokemon: HoloPokemon; dexNum?: number; sprite?: string; moveType?: (move: string) => string | undefined; width: number }) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // Fondo al azar entre los 3 del tipo: se sortea una vez por carta y se conserva mientras exista.
  const [roll] = useState(Math.random);
  const [face, setFace] = useState<{ image: string | null; sprite: OverlaySprite | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    const moves = p.moves.map((name) => ({ name, type: moveType?.(name) }));
    void (async () => {
      // Primero el sprite: la textura solo omite el artwork si hay una capa que lo sustituya. Sin red o sin sprite, cae al artwork de siempre.
      const overlay = sprite ? await resolveOverlaySprite(sprite, { animate: !reduceMotion }) : null;
      const background = cardBackgroundUrl(parseTypes(p.types)[0], roll);
      const image = await renderCardImage({ name: p.name, types: p.types, dexNum, overlay: !!overlay, background, heldItem: p.held_item, ability: p.ability, moves });
      if (vivo) setFace({ image, sprite: overlay });
    })();
    return () => { vivo = false; };
  }, [p.name, p.types, dexNum, sprite, reduceMotion, roll, p.held_item, p.ability, p.moves, moveType]);

  const tipos = parseTypes(p.types).map(typeLabel).join(", ");
  return (
    <div className="relative size-full">
      <span className="sr-only">
        {p.name}{tipos ? `. ${tipos}` : ""}{p.held_item ? `. ${p.held_item}` : ""}{p.ability ? `. ${p.ability}` : ""}{p.moves.length ? `. Movimientos: ${p.moves.join(", ")}` : ""}
      </span>
      <div aria-hidden="true" className="size-full">
        {face?.image ? (
          <HoloCard
            image={face.image} preset="edge" intensity={0.7} edgeSparkle={0.12} frame={3} glare={0.2}
            width={width} radius={width * 0.044} idle={idle} shadow={false}
            overlay={face.sprite ? <SpriteOverlay sprite={face.sprite} width={width} /> : undefined}
          />
        ) : (
          <div className="rounded-[18px] bg-white/5" style={{ aspectRatio: CARD_RATIO, width }} />
        )}
      </div>
    </div>
  );
}
