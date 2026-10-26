import type { ReactNode } from "react";
import { motion } from "motion/react";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/motion";

export interface MonView {
  name: string;
  sprite_url?: string | null;
  types?: string | null;
  held_item?: string | null;
  ability?: string | null;
  moves?: string[];
}

/**
 * Tarjeta de un pokémon del equipo. Las acciones llegan como hijos (quitar, reemplazar...).
 * Con `onSelect` la cabecera se vuelve un botón (aria-pressed) y las acciones quedan fuera
 * de él, para no anidar botones.
 */
export function MonCard({ mon, badge, banned, actions, className, onSelect, selected }: {
  mon: MonView; badge?: ReactNode; banned?: boolean; actions?: ReactNode; className?: string;
  onSelect?: () => void; selected?: boolean;
}) {
  const reduce = useReducedMotion();
  const header = (
    <>
      <PokemonSprite species={mon.name} src={mon.sprite_url} size={56} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-headline">{mon.name}</p>
        <TypeBadges types={mon.types} />
      </div>
      {badge}
      {banned && <Badge variant="destructive">Baneado</Badge>}
    </>
  );
  return (
    <motion.li
      layout="position"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.28 }}
      className={cn(
      "flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-shadow",
      banned && "ring-destructive/60",
      selected && "ring-2 ring-primary",
      className,
    )}>
      {onSelect ? (
        <button type="button" aria-pressed={!!selected} onClick={onSelect} className="flex items-center gap-3 rounded-xl text-left">
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-3">{header}</div>
      )}
      {(mon.held_item || mon.ability) && (
        <p className="text-footnote text-muted-foreground">{[mon.held_item, mon.ability].filter(Boolean).join(" · ")}</p>
      )}
      {mon.moves && mon.moves.length > 0 && <p className="text-caption text-muted-foreground">{mon.moves.join(" · ")}</p>}
      {actions && <div className="flex gap-2">{actions}</div>}
    </motion.li>
  );
}
