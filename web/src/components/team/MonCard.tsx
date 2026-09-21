import type { ReactNode } from "react";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface MonView {
  name: string;
  sprite_url?: string | null;
  types?: string | null;
  held_item?: string | null;
  ability?: string | null;
  moves?: string[];
}

/** Tarjeta de un pokémon del equipo. Las acciones llegan como hijos (quitar, reemplazar...). */
export function MonCard({ mon, badge, banned, actions, className }: {
  mon: MonView; badge?: ReactNode; banned?: boolean; actions?: ReactNode; className?: string;
}) {
  return (
    <li className={cn("flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", banned && "ring-destructive/60", className)}>
      <div className="flex items-center gap-3">
        <PokemonSprite species={mon.name} src={mon.sprite_url} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline">{mon.name}</p>
          <TypeBadges types={mon.types} />
        </div>
        {badge}
        {banned && <Badge variant="destructive">Baneado</Badge>}
      </div>
      {(mon.held_item || mon.ability) && (
        <p className="text-footnote text-muted-foreground">{[mon.held_item, mon.ability].filter(Boolean).join(" · ")}</p>
      )}
      {mon.moves && mon.moves.length > 0 && <p className="text-caption text-muted-foreground">{mon.moves.join(" · ")}</p>}
      {actions && <div className="flex gap-2">{actions}</div>}
    </li>
  );
}
