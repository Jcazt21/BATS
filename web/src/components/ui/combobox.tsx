import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
}

interface ComboboxProps {
  items: ComboboxItem[];
  value?: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

/** Tope de opciones pintadas a la vez: con listas grandes (especies, movimientos) evita listas de miles de <li>. */
const MAX_VISIBLE = 50;

/**
 * Buscador con lista desplegable, accesible con teclado (flechas, Enter, Esc) y anunciado
 * como `role="combobox"` + `listbox` (WAI-ARIA combobox pattern). No depende de una librería:
 * es la pieza base de SpeciesPicker y de los selectores de movimiento del SetEditor.
 */
export function Combobox({ items, value, onChange, placeholder, emptyText = "Sin resultados", className, disabled }: ComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = useMemo(() => items.find((i) => i.id === value) ?? null, [items, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
    return base.slice(0, MAX_VISIBLE);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

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

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeItem ? `${listboxId}-${activeItem.id}` : undefined}
        disabled={disabled}
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
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover py-1 text-popover-foreground shadow-lg"
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
        </ul>
      )}
    </div>
  );
}
