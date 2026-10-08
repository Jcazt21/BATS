import { useMemo, useState } from "react";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { BuilderMon } from "@/lib/dex/validate";
import type { DexEssentials, Species, SpeciesFilters } from "@/lib/dex/snapshot";
import { searchSpecies, speciesById } from "@/lib/dex/snapshot";
import { POKEMON_TYPES, typeLabel } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";

export interface SpeciesHint {
  /** "Te falta un pokémon de tipo Hielo". */
  label: string;
  /** Filtro que aplica el toque sobre el chip. */
  filters: SpeciesFilters;
}

interface Props {
  dex: DexEssentials;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (species: Species) => void;
  /** Equipo actual: las especies ya elegidas se deshabilitan (no se repiten especies). */
  team?: BuilderMon[];
  /** Nombres baneados, en minúsculas. */
  banned?: Set<string>;
  hint?: SpeciesHint | null;
}

const MAX_RESULTS = 60;

/**
 * Buscador de especies dentro de un ResponsiveSheet: filtros por tipo / generación / color /
 * egg group, sprite, tipos, BST y distintivos (Paradox, pseudo, restringido, Ultra Beast,
 * no legal, baneado). `hint` es un atajo de un toque para lo que le falta al equipo.
 */
export function SpeciesPicker({ dex, open, onOpenChange, onPick, team = [], banned = new Set(), hint }: Props) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SpeciesFilters>({});

  const usedIds = useMemo(
    () => new Set(team.map((m) => speciesById(dex, m.species)?.id).filter((id): id is string => !!id)),
    [team, dex],
  );

  const results = useMemo(() => searchSpecies(dex, query, filters).slice(0, MAX_RESULTS), [dex, query, filters]);

  function toggleType(t: string) {
    setFilters((f) => ({ ...f, type: f.type === t ? undefined : t }));
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Elegir especie"
      description="Busca por nombre o filtra por tipo, generación, color o egg group."
    >
      <div className="flex flex-col gap-3">
        <Input autoFocus placeholder="Buscar especie…" value={query} onChange={(e) => setQuery(e.target.value)} />

        {hint && (
          <button
            type="button"
            onClick={() => setFilters(hint.filters)}
            className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-left text-footnote text-muted-foreground transition-colors hover:bg-muted"
          >
            {hint.label}
          </button>
        )}

        <div className="flex flex-wrap gap-1.5">
          {POKEMON_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={filters.type === t}
              onClick={() => toggleType(t)}
              className={cn(`type-${t} rounded-full px-2 py-0.5 text-caption transition-opacity`, filters.type !== t && "opacity-40")}
            >
              {typeLabel(t)}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-footnote text-muted-foreground">
          <input
            type="checkbox"
            checked={!!filters.onlyLegal}
            onChange={(e) => setFilters((f) => ({ ...f, onlyLegal: e.target.checked || undefined }))}
          />
          Solo legales en la liga
        </label>

        <ul className="flex flex-col divide-y divide-border overflow-y-auto">
          {results.map((sp) => {
            const disabled = usedIds.has(sp.id) || banned.has(sp.name.toLowerCase());
            return (
              <li key={sp.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(sp)}
                  className="flex w-full items-center gap-3 px-1 py-2 text-left disabled:opacity-40"
                >
                  <PokemonSprite species={sp.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{sp.name}</span>
                      {sp.paradox && <Badge variant="warning">Paradox</Badge>}
                      {sp.pseudo && <Badge variant="info">Pseudo</Badge>}
                      {sp.restricted && <Badge variant="destructive">Restringido</Badge>}
                      {sp.ultraBeast && <Badge variant="destructive">Ultra Beast</Badge>}
                      {!sp.leagueLegal && <Badge variant="destructive">No legal</Badge>}
                      {banned.has(sp.name.toLowerCase()) && <Badge variant="destructive">Baneado</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-caption text-muted-foreground">
                      <TypeBadges types={sp.types.join(" / ")} />
                      <span>BST {sp.bst}</span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="px-1 py-6 text-center text-footnote text-muted-foreground">Sin resultados.</li>
          )}
        </ul>
      </div>
    </ResponsiveSheet>
  );
}
