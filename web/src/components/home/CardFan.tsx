import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Mecánica de BounceCards (React Bits) con cartas verticales, sin rotación ni arco:
// aparecen con rebote, y al pasar el puntero la carta se levanta y las demás se apartan.

/** Proporción de una carta (ancho / alto). */
export const CARD_RATIO = 63 / 88;

/** Separación entre cartas como fracción de su ancho (<1: se solapan). */
const SPREAD = 0.7;
/** Cuánto se apartan las vecinas al levantar una, como fracción del ancho. */
const PUSH = 0.12;
const MAX_CARD_WIDTH = 400;
const MIN_CARD_WIDTH = 110;
const HOVER_SCALE = 1.05;
/** Escala de entrada: nada aparece desde cero; arranca casi a tamaño completo y con opacidad 0. */
const ENTER_SCALE = 0.92;
const BOUNCINESS = 0.6;
const DELAY = 0.15;
const STAGGER = 0.06;

export interface CardFanProps {
  count: number;
  /** Contenido de la carta `index`; recibe el ancho calculado en px. */
  renderCard: (index: number, width: number) => ReactNode;
  className?: string;
}

interface Body { x: number; vx: number; y: number; vy: number; scale: number; vs: number; born: number }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const step = (value: number, velocity: number, target: number, stiffness: number, damping: number, dt: number): [number, number] => {
  const next = velocity + ((target - value) * stiffness - velocity * damping) * dt;
  return [value + next * dt, next];
};

export function CardFan({ count, renderCard, className }: CardFanProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wakeRef = useRef<(() => void) | null>(null);
  const [width, setWidth] = useState(0);

  // El ancho de carta sale del contenedor: las `count` cartas solapadas caben con margen para el empuje.
  const cardWidth = width ? clamp(width / (1 + (count - 1) * SPREAD + 2 * PUSH), MIN_CARD_WIDTH, MAX_CARD_WIDTH) : 0;
  const cardHeight = cardWidth / CARD_RATIO;
  // Con sitio de sobra (cartas ya en su ancho máximo) se separan más, hasta casi tocarse.
  const spread = count > 1 ? Math.min(cardWidth * 0.9, (width - cardWidth * (1 + 2 * PUSH)) / (count - 1)) : 0;

  const settingsRef = useRef({ count, cardWidth, cardHeight, spread });
  useLayoutEffect(() => {
    settingsRef.current = { count, cardWidth, cardHeight, spread };
    wakeRef.current?.();
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(root);
    setWidth(root.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const bodies: Body[] = [];
    const state = { hovered: -1, time: 0, layer: -1 };
    let raf = 0;
    let last = performance.now();
    let alive = true;

    const slotX = (i: number) => (i - (settingsRef.current.count - 1) / 2) * settingsRef.current.spread;

    const body = (i: number): Body => {
      if (!bodies[i]) bodies[i] = { x: slotX(i), vx: 0, y: 0, vy: 0, scale: reduce ? 1 : ENTER_SCALE, vs: 0, born: state.time };
      return bodies[i];
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      const s = settingsRef.current;
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      state.time += dt;

      const hovered = state.hovered;
      const popStiffness = 170;
      const popDamping = 2 * (1 - 0.85 * BOUNCINESS) * Math.sqrt(popStiffness);
      const moveStiffness = 210;
      const moveDamping = 2 * (reduce ? 1 : 0.72) * Math.sqrt(moveStiffness);
      const substeps = Math.ceil(dt / (1 / 240));
      const h = dt / substeps;
      let moving = 0;

      for (let i = 0; i < s.count; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const card = body(i);
        const appeared = reduce || state.time - card.born >= DELAY + i * STAGGER;
        let targetX = slotX(i);
        let targetY = 0;
        let targetScale = appeared ? 1 : ENTER_SCALE;
        if (hovered >= 0 && appeared) {
          if (i === hovered) {
            targetY = -s.cardHeight * 0.03;
            targetScale = HOVER_SCALE;
          } else {
            targetX += Math.sign(i - hovered) * s.cardWidth * PUSH;
          }
        }
        for (let k = 0; k < substeps; k++) {
          [card.x, card.vx] = step(card.x, card.vx, targetX, moveStiffness, moveDamping, h);
          [card.y, card.vy] = step(card.y, card.vy, targetY, moveStiffness, moveDamping, h);
          if (reduce) {
            card.scale = targetScale;
            card.vs = 0;
          } else {
            [card.scale, card.vs] = step(card.scale, card.vs, targetScale, popStiffness, popDamping, h);
          }
        }
        moving +=
          Math.abs(card.vx) + Math.abs(card.vy) + Math.abs(card.vs) * 100 +
          Math.abs(targetX - card.x) + Math.abs(targetY - card.y) +
          Math.abs(targetScale - card.scale) * 100 + (appeared ? 0 : 1);
        el.style.opacity = appeared ? "1" : "0";
        el.style.transform = `translate(-50%, -50%) translate3d(${card.x.toFixed(2)}px, ${card.y.toFixed(2)}px, 0) scale(${Math.max(0, card.scale).toFixed(4)})`;
      }

      if (state.layer !== hovered) {
        state.layer = hovered;
        cardRefs.current.forEach((el, i) => {
          if (el) el.style.zIndex = String(i === hovered ? s.count + 1 : i + 1);
        });
      }

      if (moving > 0.02) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    // La carta más cercana en horizontal; con histéresis para que el borde entre dos solapadas no parpadee.
    const pick = (event: PointerEvent): number => {
      const s = settingsRef.current;
      const rect = root.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      let best = -1;
      let distance = Infinity;
      for (let i = 0; i < s.count; i++) {
        const gap = Math.abs(px - (bodies[i]?.x ?? slotX(i)));
        if (gap < distance) { distance = gap; best = i; }
      }
      if (best < 0 || distance > s.cardWidth / 2 || Math.abs(py) > s.cardHeight / 2) return -1;
      if (state.hovered >= 0 && state.hovered !== best) {
        const current = bodies[state.hovered]?.x ?? slotX(state.hovered);
        if (Math.abs(px - current) - distance < 6) return state.hovered;
      }
      return best;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const next = pick(event);
      if (next !== state.hovered) { state.hovered = next; wake(); }
    };
    const onLeave = () => {
      if (state.hovered !== -1) { state.hovered = -1; wake(); }
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerdown", onMove);
    root.addEventListener("pointerleave", onLeave);
    wake();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerdown", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ position: "relative", width: "100%", height: cardHeight ? cardHeight * 1.1 : 0, touchAction: "pan-y" }}
    >
      {cardWidth > 0 &&
        Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            ref={(el) => { cardRefs.current[i] = el; }}
            style={{
              position: "absolute", top: "50%", left: "50%", width: cardWidth, height: cardHeight,
              transform: `translate(-50%, -50%) scale(${ENTER_SCALE})`, opacity: 0, transition: "opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)",
              willChange: "transform", zIndex: i + 1,
            }}
          >
            {renderCard(i, cardWidth)}
          </div>
        ))}
    </div>
  );
}
