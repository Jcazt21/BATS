import { cn } from "@/lib/utils";
import { parseTypes, typeLabel, type PokemonType } from "@/lib/pokemon-types";

export function TypeBadge({ type, className }: { type: PokemonType; className?: string }) {
  return (
    <span
      className={cn(
        `type-${type} inline-flex h-5 items-center rounded-full px-2 text-caption font-medium leading-none`,
        className,
      )}
    >
      {typeLabel(type)}
    </span>
  );
}

/** "Dragon / Ground" → dos etiquetas. */
export function TypeBadges({ types, className }: { types: string | null | undefined; className?: string }) {
  const list = parseTypes(types);
  if (!list.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {list.map((t) => <TypeBadge key={t} type={t} />)}
    </span>
  );
}
