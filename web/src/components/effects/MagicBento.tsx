// MagicBento — React Bits (https://reactbits.dev), portado a TypeScript.
// Cambios respecto al original: tipos; sin los visuales de demo (ni @hugeicons), sin estrellas,
// inclinación ni magnetismo; los colores salen de los tokens de la app (`--card`, `--border`,
// `--primary`…) en vez de los temas fijos, así que siguen el modo claro/oscuro y el color del mes.
import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import "./MagicBento.css";

export interface MagicBentoItem {
  id?: string | number;
  /** Contenido propio de la tarjeta; las luces, el borde y la onda de clic siguen aplicándose. */
  content: ReactNode;
  /** Etiqueta accesible de la sección de la tarjeta. */
  label?: string;
  colSpan?: number;
  rowSpan?: number;
  className?: string;
}

export interface MagicBentoProps extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "style"> {
  items: MagicBentoItem[];
  /** Columnas en pantallas anchas; los `colSpan` se escalan al bajar a 2 o 1 columnas. */
  columns?: number;
  rowHeight?: number;
  gap?: number;
  /** Radio de las tarjetas en px (por defecto el de las tarjetas de la app). */
  radius?: number;
  glowColor?: string;
  enableBorderGlow?: boolean;
  enableSpotlight?: boolean;
  spotlightRadius?: number;
  clickEffect?: boolean;
  intro?: boolean;
  disableAnimations?: boolean;
  style?: CSSProperties;
}

const STAGGER = 70;
/** Ancho del grid (px) desde el que se usan todas las columnas / dos columnas. */
const WIDE = 960;
const PAIR = 560;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function MagicBento({
  items, columns = 4, rowHeight = 160, gap = 12, radius = 28, glowColor = "var(--primary)",
  enableBorderGlow = true, enableSpotlight = true, spotlightRadius = 320, clickEffect = true,
  intro = true, disableAnimations = false, className = "", style, ...rest
}: MagicBentoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLElement | null)[]>([]);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const engineRef = useRef<{ sync: () => void } | null>(null);
  const [cols, setCols] = useState(columns);

  const settings = { columns, enableBorderGlow, enableSpotlight, spotlightRadius: Math.max(40, spotlightRadius), clickEffect, intro, disableAnimations };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const motion = !settingsRef.current.disableAnimations && !reduced;
    const playIntro = motion && settingsRef.current.intro && typeof IntersectionObserver !== "undefined";
    if (motion) root.dataset.motion = ""; else delete root.dataset.motion;
    if (playIntro) root.dataset.intro = ""; else delete root.dataset.intro;

    const pointer = { x: -1e5, y: -1e5, inside: false, down: -1 };
    const light = { x: -1e5, y: -1e5, near: 0, ready: false };
    const states: { hot: number; press: number; vpress: number; active: boolean; written: Record<string, string> }[] = [];
    const wave = { x: 0, y: 0, t: -1, duration: 1.1, reach: 800 };
    let rects: (DOMRect | null)[] = [];
    let bounds: DOMRect | null = null;
    let dirty = true;
    let raf = 0;
    let last = 0;
    let visible = true;
    let entered = !playIntro;
    let introTimer = 0;
    let settleTimer = 0;

    const stateFor = (i: number) => (states[i] ??= { hot: 0, press: 1, vpress: 0, active: false, written: {} });

    const write = (el: HTMLElement, st: { written: Record<string, string> }, name: string, value: string) => {
      if (st.written[name] === value) return;
      st.written[name] = value;
      el.style.setProperty(name, value);
    };

    const measure = () => {
      dirty = false;
      bounds = root.getBoundingClientRect();
      rects = cellRefs.current.map((c) => (c ? c.getBoundingClientRect() : null));
    };

    const startWave = (x: number, y: number, duration: number) => {
      if (!motion || !bounds) return;
      wave.x = x; wave.y = y; wave.t = 0; wave.duration = duration;
      wave.reach = Math.max(
        Math.hypot(x - bounds.left, y - bounds.top), Math.hypot(x - bounds.right, y - bounds.top),
        Math.hypot(x - bounds.left, y - bounds.bottom), Math.hypot(x - bounds.right, y - bounds.bottom),
      ) + 140;
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (dirty) measure();
      const s = settingsRef.current;
      let busy = false;

      const margin = s.spotlightRadius * 0.5;
      const near = pointer.inside && bounds && pointer.x > bounds.left - margin && pointer.x < bounds.right + margin &&
        pointer.y > bounds.top - margin && pointer.y < bounds.bottom + margin ? 1 : 0;
      if (!light.ready && near) { light.x = pointer.x; light.y = pointer.y; light.ready = true; }
      const follow = 1 - Math.exp(-dt / 0.05);
      light.x += (pointer.x - light.x) * follow;
      light.y += (pointer.y - light.y) * follow;
      light.near += (near - light.near) * (1 - Math.exp(-dt / (near > light.near ? 0.12 : 0.4)));
      if (Math.abs(near - light.near) < 0.002) light.near = near; else busy = true;
      if (Math.abs(pointer.x - light.x) + Math.abs(pointer.y - light.y) > 0.3) busy = true;

      let waveRadius = 0;
      let waveAlpha = 0;
      if (wave.t >= 0) {
        wave.t += dt;
        const progress = Math.min(1, wave.t / wave.duration);
        waveRadius = wave.reach * (1 - Math.pow(1 - progress, 2.2));
        waveAlpha = Math.pow(1 - progress, 1.3);
        if (progress >= 1) { wave.t = -1; waveAlpha = 0; } else busy = true;
      }

      cardRefs.current.forEach((card, i) => {
        const rect = rects[i];
        if (!card || !rect) return;
        const st = stateFor(i);
        const lx = light.x - rect.left;
        const ly = light.y - rect.top;
        const px = pointer.x - rect.left;
        const py = pointer.y - rect.top;
        const inside = pointer.inside && entered && px >= 0 && py >= 0 && px <= rect.width && py <= rect.height;
        if (inside !== st.active) {
          st.active = inside;
          if (inside) card.dataset.active = ""; else delete card.dataset.active;
        }

        const hotTarget = inside && s.enableSpotlight ? 1 : 0;
        st.hot += (hotTarget - st.hot) * (1 - Math.exp(-dt / (hotTarget > st.hot ? 0.14 : 0.32)));
        if (Math.abs(hotTarget - st.hot) < 0.002) st.hot = hotTarget; else busy = true;

        // Resorte del "hundir" al mantener pulsado.
        const pressTarget = pointer.down === i && s.clickEffect && motion ? 0.985 : 1;
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let k = 0; k < steps; k++) {
          st.vpress += (420 * (pressTarget - st.press) - 28 * st.vpress) * h;
          st.press += st.vpress * h;
        }
        if (Math.abs(pressTarget - st.press) < 0.0002 && Math.abs(st.vpress) < 0.001) { st.press = pressTarget; st.vpress = 0; }
        else busy = true;

        write(card, st, "--mb-x", `${lx.toFixed(1)}px`);
        write(card, st, "--mb-y", `${ly.toFixed(1)}px`);
        write(card, st, "--mb-near", (s.enableBorderGlow ? light.near : 0).toFixed(3));
        write(card, st, "--mb-hot", st.hot.toFixed(3));
        write(card, st, "--mb-press", st.press.toFixed(4));
        write(card, st, "--mb-wx", `${(wave.x - rect.left).toFixed(1)}px`);
        write(card, st, "--mb-wy", `${(wave.y - rect.top).toFixed(1)}px`);
        write(card, st, "--mb-wr", `${waveRadius.toFixed(1)}px`);
        write(card, st, "--mb-wa", waveAlpha.toFixed(3));
      });

      if (busy && visible) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf || !visible) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const cardIndex = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return -1;
      const card = target.closest(".magic-bento__card");
      return card instanceof HTMLElement ? cardRefs.current.indexOf(card) : -1;
    };

    const onPointerMove = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; wake(); };
    const onPointerOut = (e: PointerEvent) => { if (e.relatedTarget) return; pointer.inside = false; pointer.down = -1; wake(); };
    const onPointerDown = (e: PointerEvent) => {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; pointer.down = cardIndex(e.target); wake();
    };
    const release = () => { if (pointer.down < 0) return; pointer.down = -1; wake(); };
    const onClick = (e: MouseEvent) => {
      if (!settingsRef.current.clickEffect || cardIndex(e.target) < 0) return;
      if (dirty) measure();
      startWave(e.clientX, e.clientY, 1.1);
      wake();
    };
    const onScroll = () => { dirty = true; wake(); };

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const width = root.clientWidth;
      const max = settingsRef.current.columns;
      setCols(width >= WIDE ? max : width >= PAIR ? Math.min(2, max) : 1);
      dirty = true;
      wake();
    });
    resizeObserver?.observe(root);

    const showAll = (delay: (i: number) => string) => {
      cellRefs.current.forEach((cell, i) => {
        if (!cell) return;
        cell.style.setProperty("--mb-delay", delay(i));
        cell.dataset.state = "in";
      });
    };

    const enter = () => {
      entered = true;
      showAll((i) => `${i * STAGGER}ms`);
      if (dirty) measure();
      introTimer = window.setTimeout(() => { if (bounds) startWave(bounds.left, bounds.top, 1.7); wake(); }, 260);
      settleTimer = window.setTimeout(() => showAll(() => "0ms"), cellRefs.current.length * STAGGER + 900);
      wake();
    };

    let gate: IntersectionObserver | null = null;
    if (playIntro) {
      gate = new IntersectionObserver((entries, observer) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        observer.disconnect();
        enter();
      }, { threshold: 0.15 });
      gate.observe(root);
    } else showAll(() => "0ms");

    const visibility = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      visible = entries.some((en) => en.isIntersecting);
      if (visible) { dirty = true; wake(); }
    });
    visibility?.observe(root);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("pointerout", onPointerOut);
    root.addEventListener("click", onClick);

    engineRef.current = {
      // Tarjetas nuevas (datos que llegan después) aparecen sin esperar otra intro.
      sync: () => {
        if (!entered && playIntro) return;
        cellRefs.current.forEach((cell) => {
          if (cell && cell.dataset.state !== "in") { cell.style.setProperty("--mb-delay", "0ms"); cell.dataset.state = "in"; }
        });
        dirty = true;
        wake();
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(introTimer);
      window.clearTimeout(settleTimer);
      gate?.disconnect();
      visibility?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("pointerout", onPointerOut);
      root.removeEventListener("click", onClick);
      engineRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    engineRef.current?.sync();
  }, [items, cols, rowHeight, gap, radius, enableSpotlight, enableBorderGlow]);

  const span = Math.max(1, Math.min(cols, columns));
  cellRefs.current.length = items.length;
  cardRefs.current.length = items.length;

  return (
    <div
      {...rest}
      ref={rootRef}
      className={`magic-bento ${className}`.trim()}
      style={{
        "--mb-glow": glowColor,
        "--mb-radius": `${Math.max(0, radius)}px`,
        "--mb-spot-size": `${Math.max(40, spotlightRadius)}px`,
        "--mb-border-size": `${Math.round(Math.max(40, spotlightRadius) * 0.75)}px`,
        gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))`,
        gridAutoRows: `minmax(${rowHeight}px, auto)`,
        gap: `${Math.max(0, gap)}px`,
        ...style,
      } as CSSProperties}
    >
      {items.map((item, i) => (
        <div
          key={item.id ?? i}
          ref={(el) => { cellRefs.current[i] = el; }}
          className="magic-bento__cell"
          style={{
            // Los spans se escalan a las columnas activas (12 → 2 → 1) en vez de truncarse.
            gridColumn: `span ${clamp(Math.round(((item.colSpan ?? 1) * span) / columns), 1, span)}`,
            gridRow: `span ${Math.max(1, Math.round(item.rowSpan ?? 1))}`,
          }}
        >
          <section ref={(el) => { cardRefs.current[i] = el; }} aria-label={item.label} className={`magic-bento__card ${item.className ?? ""}`.trim()}>
            {enableSpotlight && <span className="magic-bento__light" aria-hidden="true" />}
            <div className="magic-bento__content">{item.content}</div>
            <span className="magic-bento__rim" aria-hidden="true" />
            <span className="magic-bento__border" aria-hidden="true" />
          </section>
        </div>
      ))}
    </div>
  );
}
