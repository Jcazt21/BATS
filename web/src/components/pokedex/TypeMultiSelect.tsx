import { ChevronDown, Plus, X } from "lucide-react";
import { TypeBadge } from "@/components/app/TypeBadge";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { POKEMON_TYPES, typeLabel, type PokemonType } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";

const MAX = 2;

/**
 * Selector de tipos con etiquetas: cada tipo elegido queda como chip de su color (tocarlo lo quita)
 * y el menú agrega más. Máximo dos, como los tipos de un pokémon.
 */
export function TypeMultiSelect({ value, onChange }: { value: PokemonType[]; onChange: (v: PokemonType[]) => void }) {
  const full = value.length >= MAX;
  const toggle = (t: PokemonType, on: boolean) =>
    onChange(on ? (value.includes(t) || full ? value : [...value, t]) : value.filter((x) => x !== t));

  return (
    <div role="group" aria-label="Tipos" className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl bg-background/60 p-1 ring-1 ring-border">
      {value.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => toggle(t, false)}
          aria-label={`Quitar ${typeLabel(t)}`}
          className={cn(
            `type-${t}`,
            "press inline-flex h-8 items-center gap-1 rounded-full pr-2 pl-3 text-footnote font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {typeLabel(t)}
          <X className="size-3.5 opacity-80" aria-hidden />
        </button>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={full}
          aria-label="Agregar tipo"
          className="press inline-flex h-8 items-center gap-1 rounded-full px-3 text-footnote font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        >
          {full ? (
            <span>Máximo 2</span>
          ) : (
            <>
              <Plus className="size-3.5" aria-hidden />
              {value.length ? "Tipo" : "Filtrar por tipo"}
              <ChevronDown className="size-3.5" aria-hidden />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="grid max-h-80 w-64 grid-cols-2 gap-1 p-2">
          {POKEMON_TYPES.map((t) => (
            <DropdownMenuCheckboxItem
              key={t}
              checked={value.includes(t)}
              disabled={full && !value.includes(t)}
              onCheckedChange={(on) => toggle(t, on)}
              className="rounded-lg"
            >
              <TypeBadge type={t} className="h-6 px-2.5 text-footnote" />
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          aria-label="Quitar todos los tipos"
          className="ml-auto inline-flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
