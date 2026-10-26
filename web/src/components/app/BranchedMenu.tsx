import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./BranchedMenu.css";

/*
 * BranchedMenu — React Bits (https://reactbits.dev/micro/branched-menu), variante TS-CSS.
 * Adaptado: iconos como ReactNode (lucide) en vez de Hugeicons, `active` controlable desde
 * fuera (p. ej. la ruta actual) y la sección del ítem activo se despliega sola al cambiar.
 */

export interface BranchedMenuChild {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface BranchedMenuItem {
  label: string;
  value?: string;
  children?: BranchedMenuChild[];
}

export interface BranchedMenuProps {
  items: BranchedMenuItem[];
  defaultOpen?: number | number[];
  /** Valor activo controlado; si se omite, el menú gestiona su propio estado. */
  active?: string;
  defaultActive?: string;
  onSelect?: (value: string, item: BranchedMenuChild | BranchedMenuItem) => void;
  onToggle?: (index: number, open: boolean) => void;
  color?: string;
  accentColor?: string;
  lineColor?: string;
  width?: number;
  rowHeight?: number;
  indent?: number;
  trunk?: number;
  radius?: number;
  lineWidth?: number;
  fontSize?: number;
  drawDuration?: number;
  foldDuration?: number;
  className?: string;
}

const PAD = 6;
const MARK = 16;

const toSet = (open: number | number[]) => new Set(Array.isArray(open) ? open : open >= 0 ? [open] : []);
const sectionOf = (items: BranchedMenuItem[], value: string) =>
  items.findIndex((it) => it.children?.some((kid) => kid.value === value));

export function BranchedMenu({
  items,
  defaultOpen = 0,
  active: activeProp,
  defaultActive = "",
  onSelect,
  onToggle,
  color = "var(--foreground)",
  accentColor = "var(--foreground)",
  lineColor = "var(--border)",
  width = 240,
  rowHeight = 36,
  indent = 40,
  trunk = 14,
  radius = 10,
  lineWidth = 1.5,
  fontSize = 14,
  drawDuration = 400,
  foldDuration = 300,
  className = "",
}: BranchedMenuProps) {
  const [open, setOpen] = useState<Set<number>>(() => {
    const set = toSet(defaultOpen);
    const s = activeProp ? sectionOf(items, activeProp) : -1;
    if (s >= 0) set.add(s);
    return set;
  });
  const [internalActive, setInternalActive] = useState(() => {
    if (defaultActive) return defaultActive;
    const first = items.find((it, i) => it.children && toSet(defaultOpen).has(i));
    return first?.children?.[0]?.value ?? "";
  });
  const active = activeProp ?? internalActive;

  // Si el activo cambia desde fuera (navegación, botón atrás…), despliega su sección.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    const s = sectionOf(items, active);
    if (s >= 0 && !open.has(s)) setOpen(new Set(open).add(s));
  }

  const navRef = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLButtonElement | null)[]>([]);
  const markerRef = useRef<HTMLSpanElement>(null);

  const activeSection = sectionOf(items, active);
  const markerShown = activeSection >= 0 && open.has(activeSection);
  useLayoutEffect(() => {
    const place = (glide: boolean) => {
      const m = markerRef.current;
      const el = heads.current[activeSection];
      if (!m) return;
      const on = markerShown && el;
      if (!glide) m.style.transition = "none";
      if (on) m.style.transform = `translateY(${el.offsetTop + (el.offsetHeight - MARK) / 2 + 1}px)`;
      m.toggleAttribute("data-on", Boolean(on));
      if (!glide) {
        void m.offsetHeight;
        m.style.transition = "";
      }
    };
    place(true);
    if (typeof ResizeObserver === "undefined") return;
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      place(false);
    });
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [activeSection, markerShown, items, fontSize, rowHeight]);

  const select = (value: string, item: BranchedMenuChild | BranchedMenuItem) => {
    setInternalActive(value);
    onSelect?.(value, item);
  };
  const toggle = (i: number) => {
    const isOpen = !open.has(i);
    const next = new Set(open);
    if (isOpen) next.add(i);
    else next.delete(i);
    setOpen(next);
    onToggle?.(i, isOpen);
  };

  const r = Math.min(radius, rowHeight / 2 - 2);
  const endX = indent - 8;
  const rowY = (k: number) => PAD + k * rowHeight + rowHeight / 2;
  const branch = (k: number) => `M ${trunk} ${rowY(k) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(k)} H ${endX}`;
  const reach = (k: number) => `M ${trunk} 0 V ${rowY(k) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(k)} H ${endX}`;
  const length = (k: number) => rowY(k) - r + (Math.PI * r) / 2 + (endX - trunk - r);

  return (
    <nav
      ref={navRef}
      className={`branched-menu${className ? ` ${className}` : ""}`}
      style={
        {
          "--bm-w": `${width}px`,
          "--bm-ink": color,
          "--bm-accent": accentColor,
          "--bm-line": lineColor,
          "--bm-font": `${fontSize}px`,
          "--bm-row": `${rowHeight}px`,
          "--bm-indent": `${indent}px`,
          "--bm-line-w": lineWidth,
          "--bm-draw": `${drawDuration}ms`,
          "--bm-fold": `${foldDuration}ms`,
        } as CSSProperties
      }
    >
      <span ref={markerRef} className="branched-menu__marker" aria-hidden="true" />
      {items.map((item, i) => {
        const kids = item.children;
        const isOpen = kids ? open.has(i) : false;
        const leafValue = item.value ?? item.label;
        const leafActive = !kids && leafValue === active;
        const bodyH = kids ? PAD * 2 + kids.length * rowHeight : 0;
        return (
          <div key={item.value ?? item.label} className="branched-menu__section" data-open={isOpen ? "" : undefined}>
            <button
              ref={(el) => {
                heads.current[i] = el;
              }}
              type="button"
              className="branched-menu__head"
              aria-expanded={kids ? isOpen : undefined}
              aria-current={leafActive ? "page" : undefined}
              data-active={leafActive ? "" : undefined}
              onClick={() => (kids ? toggle(i) : select(leafValue, item))}
            >
              {item.label}
            </button>
            {kids ? (
              <div className="branched-menu__body" inert={!isOpen}>
                <div className="branched-menu__fold">
                  <div className="branched-menu__tree" style={{ height: bodyH }}>
                    <svg className="branched-menu__lines" width={indent} height={bodyH} aria-hidden="true">
                      <path className="branched-menu__base" d={`M ${trunk} 0 V ${rowY(kids.length - 1) - r}`} />
                      {kids.map((kid, k) => (
                        <path key={kid.value} className="branched-menu__base" d={branch(k)} />
                      ))}
                      {kids.map((kid, k) => (
                        <path
                          key={kid.value}
                          className="branched-menu__reach"
                          d={reach(k)}
                          style={{
                            strokeDasharray: length(k),
                            strokeDashoffset: kid.value === active ? 0 : length(k),
                          }}
                        />
                      ))}
                    </svg>
                    {kids.map((kid) => (
                      <button
                        key={kid.value}
                        type="button"
                        className="branched-menu__item"
                        aria-current={kid.value === active ? "page" : undefined}
                        data-active={kid.value === active ? "" : undefined}
                        tabIndex={isOpen ? 0 : -1}
                        onClick={() => select(kid.value, kid)}
                      >
                        {kid.icon ? (
                          <span className="branched-menu__icon" aria-hidden="true">
                            {kid.icon}
                          </span>
                        ) : null}
                        <span className="branched-menu__label">{kid.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
