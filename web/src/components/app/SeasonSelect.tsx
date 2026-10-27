import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SeasonChoice = "active" | "all" | number;
interface SeasonLike { season_id: number; season_name: string; is_active: boolean }

/** Selector de temporada: la activa primero, luego las anteriores y, si se permite, "Todas". */
export function SeasonSelect({ seasons, value, onChange, allowAll = true }: {
  seasons: SeasonLike[];
  value: SeasonChoice;
  onChange: (v: SeasonChoice) => void;
  allowAll?: boolean;
}) {
  const active = seasons.find((s) => s.is_active);
  const label = value === "all" ? "Todas las temporadas"
    : value === "active" ? (active?.season_name ?? "Activa")
    : (seasons.find((s) => s.season_id === value)?.season_name ?? `Temporada ${value}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="lg" className="h-11" />}>
        <span className="text-muted-foreground">Temporada</span>
        <span>{label}</span>
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-52">
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(v: string) => onChange(v === "active" || v === "all" ? v : Number(v))}
        >
          {active && <DropdownMenuRadioItem closeOnClick className="min-h-11 text-subhead" value="active">{active.season_name} (activa)</DropdownMenuRadioItem>}
          {seasons.filter((s) => !s.is_active).map((s) => (
            <DropdownMenuRadioItem key={s.season_id} closeOnClick className="min-h-11 text-subhead" value={String(s.season_id)}>{s.season_name}</DropdownMenuRadioItem>
          ))}
          {allowAll && <DropdownMenuRadioItem closeOnClick className="min-h-11 text-subhead" value="all">Todas las temporadas</DropdownMenuRadioItem>}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
