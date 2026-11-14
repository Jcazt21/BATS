import { POKEMON_TYPES, typeLabel, type PokemonType } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";

/** Chips de tipo (radiogroup): "Todos" o uno. Flechas mueven la selección, como en `SegmentedControl`. */
export function TypeFilter({ value, onChange, className }: { value: PokemonType | null; onChange: (v: PokemonType | null) => void; className?: string }) {
  const opciones: (PokemonType | null)[] = [null, ...POKEMON_TYPES];

  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = opciones[(i + (e.key === "ArrowRight" ? 1 : -1) + opciones.length) % opciones.length];
    onChange(next);
    (e.currentTarget.parentElement?.querySelector(`[data-value="${next ?? ""}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Filtrar por tipo" className={cn("flex flex-wrap gap-2", className)}>
      {opciones.map((t, i) => {
        const on = t === value;
        return (
          <button
            key={t ?? "todos"} type="button" role="radio" aria-checked={on} data-value={t ?? ""}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t)} onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "press relative inline-flex h-8 items-center rounded-full px-3 text-footnote font-medium outline-none transition-colors duration-200 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {t ? typeLabel(t) : "Todos"}
          </button>
        );
      })}
    </div>
  );
}
