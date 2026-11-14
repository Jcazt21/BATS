import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  id: string;
  label: string;
  sublabel?: string;
  /** Texto extra por el que también se puede buscar (un email, un alias…). No se pinta. */
  keywords?: string;
  icon?: ReactNode;
}

interface ComboboxProps {
  items: ComboboxItem[];
  value?: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  /** Clases para el <input> en sí (el `className` va al contenedor). */
  inputClassName?: string;
  disabled?: boolean;
  /** Si llega y hay un valor elegido, se pinta un botón para vaciarlo. */
  onClear?: () => void;
  /** Nombre accesible del botón de vaciar ("Quitar objeto"...). */
  clearLabel?: string;
  /** Nombre accesible del campo, cuando no hay un <label> visible que lo nombre. */
  ariaLabel?: string;
}

/** Tope de opciones pintadas a la vez: con listas grandes (especies, movimientos) evita listas de miles de <li>. */
const MAX_VISIBLE = 50;

/** Alto máximo de la lista, en px (espejo de max-h-64). */
const LIST_MAX_H = 256;

/**
 * Buscador con lista desplegable, accesible con teclado (flechas, Enter, Esc) y anunciado
 * como `role="combobox"` + `listbox` (WAI-ARIA combobox pattern). No depende de una librería:
 * es la pieza base de SpeciesPicker y de los selectores de movimiento del SetEditor.
 */
export function Combobox({ items, value, onChange, placeholder, emptyText = "Sin resultados", className, inputClassName, disabled, onClear, clearLabel = "Quitar", ariaLabel }: ComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; flip: boolean } | null>(null);
  const listboxId = useId();

  const selected = useMemo(() => items.find((i) => i.id === value) ?? null, [items, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? items.filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q))
      : items;
    return base.slice(0, MAX_VISIBLE);
  }, [items, query]);

  /**
   * La lista se pinta en un portal sobre <body> con posición fija: dentro de un diálogo o de
   * una hoja con scroll, un <ul> absoluto quedaba recortado por el `overflow` del contenedor.
   */
  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const flip = below < Math.min(LIST_MAX_H, 160) && r.top > below;
    setRect({ left: r.left, width: r.width, flip, top: flip ? r.top : r.bottom });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, filtered.length]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", place, true); // capture: también el scroll del diálogo
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  function commit(item: ComboboxItem) {
    onChange(item.id);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        commit(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery("");
      }
    }
  }

  const activeItem = filtered[activeIndex];
  // Por `value`, no por `selected`: un valor que ya no está en la lista (un movimiento ilegal
  // importado de un paste) es justo el que más hace falta poder quitar.
  const clearable = !!onClear && value != null && !disabled;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeItem ? `${listboxId}-${activeItem.id}` : undefined}
        disabled={disabled}
        className={cn(clearable && "pr-9", inputClassName)}
        placeholder={selected ? selected.label : placeholder}
        value={query}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={onKeyDown}
      />
      {clearable && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={(e) => {
            e.preventDefault(); // dentro de un <label>: no reenviar el click al input
            onClear();
            setQuery("");
          }}
          className="absolute inset-y-0 right-1 my-auto flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
      {open && rect && createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          style={{
            position: "fixed", left: rect.left, width: rect.width,
            ...(rect.flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + 4 }),
          }}
          className="z-[60] max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover py-1 text-popover-foreground shadow-lg"
        >
          {filtered.length === 0 && <li className="px-3 py-2 text-footnote text-muted-foreground">{emptyText}</li>}
          {filtered.map((item, i) => (
            <li
              key={item.id}
              id={`${listboxId}-${item.id}`}
              role="option"
              aria-selected={item.id === value}
              onMouseDown={(e) => {
                e.preventDefault(); // no perder el foco antes del click
                commit(item);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-body",
                i === activeIndex && "bg-accent text-accent-foreground",
              )}
            >
              {item.icon}
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{item.label}</span>
                {item.sublabel && <span className="truncate text-caption text-muted-foreground">{item.sublabel}</span>}
              </span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
