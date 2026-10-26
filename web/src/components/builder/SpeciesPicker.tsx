import { useMemo, useState } from "react";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { BuilderMon } from "@/lib/dex/validate";
import type { DexEssentials, Species, SpeciesFilters, SpeciesSort } from "@/lib/dex/snapshot";
import type { SpeciesHint } from "@/lib/dex/hints";
import { searchSpecies, speciesById, toId } from "@/lib/dex/snapshot";
import { POKEMON_TYPES, typeLabel } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";

interface Props {
  dex: DexEssentials;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (species: Species) => void;
  /** Equipo actual: las especies ya elegidas se deshabilitan (no se repiten especies). */
  team?: BuilderMon[];
  /** Nombres baneados, en minúsculas. */
  banned?: Set<string>;
  /** Una sugerencia por cada regla de conjunto que le falta al equipo (lib/dex/hints.ts). */
  hints?: SpeciesHint[];
}

const MAX_RESULTS = 60;
/** Las especies ilegales no se pueden registrar: se ocultan salvo que el jugador lo pida. */
const DEFAULT_FILTERS: SpeciesFilters = { onlyLegal: true };

const SORT_OPTIONS: { value: SpeciesSort; label: string }[] = [
  { value: "num", label: "Nº Pokédex" },
  { value: "name", label: "Nombre" },
  { value: "bst", label: "BST" },
  { value: "spe", label: "Velocidad" },
];

const selectClass = "h-9 min-w-0 flex-1 rounded-xl border border-input bg-card px-2 text-footnote";

/**
 * Buscador de especies dentro de un ResponsiveSheet: filtros por tipo / generación / color /
 * egg group, orden, sprite, tipos, BST y distintivos (Paradox, pseudo, restringido, Ultra Beast,
 * no legal, baneado). `hints` son atajos de un toque para lo que le falta al equipo.
 */
export function SpeciesPicker({ dex, open, onOpenChange, onPick, team = [], banned = new Set(), hints = [] }: Props) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SpeciesFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SpeciesSort>("num");

  // Valores reales del snapshot: así los selects nunca ofrecen algo que no exista.
  const options = useMemo(() => {
    const all = Object.values(dex.species);
    const uniq = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
    return {
      gens: [...new Set(all.map((sp) => sp.gen))].filter((g) => g > 0).sort((a, b) => a - b),
      colors: uniq(all.map((sp) => sp.color).filter(Boolean)),
      eggGroups: uniq(all.flatMap((sp) => sp.eggGroups)),
    };
  }, [dex]);

  const usedIds = useMemo(
    () => new Set(team.map((m) => speciesById(dex, m.species)?.id).filter((id): id is string => !!id)),
    [team, dex],
  );

  const matches = useMemo(() => searchSpecies(dex, query, filters, sort), [dex, query, filters, sort]);
  const results = matches.slice(0, MAX_RESULTS);
  const activeCount = [filters.type, filters.gen, filters.color, filters.eggGroup].filter((v) => v != null).length;

  // Los atajos traen la grafía de la temporada ("yellow", "water1", "Ice"): se busca la opción
  // equivalente del dex para que el control muestre el filtro que de verdad está activo.
  const shown = (values: string[], current?: string) => (current ? values.find((v) => toId(v) === toId(current)) ?? "" : "");

  function toggleType(t: string) {
    setFilters((f) => ({ ...f, type: toId(f.type) === t ? undefined : t }));
  }

  function setFilter<K extends "gen" | "color" | "eggGroup">(key: K, value: SpeciesFilters[K] | undefined) {
    setFilters((f) => ({ ...f, [key]: value }));
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

        {hints.length > 0 && (
          <div role="group" aria-label="Lo que le falta al equipo" className="flex flex-col gap-1.5">
            {hints.map((h) => (
              <button
                key={h.label}
                type="button"
                // El atajo reemplaza los filtros de especie, pero respeta "solo legales".
                onClick={() => setFilters((f) => ({ ...h.filters, onlyLegal: f.onlyLegal }))}
                className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-left text-footnote text-muted-foreground transition-colors hover:bg-muted"
              >
                {h.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {POKEMON_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={toId(filters.type) === t}
              onClick={() => toggleType(t)}
              className={cn(`type-${t} rounded-full px-2 py-0.5 text-caption transition-opacity`, toId(filters.type) !== t && "opacity-40")}
            >
              {typeLabel(t)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Generación" className={selectClass}
            value={filters.gen ?? ""}
            onChange={(e) => setFilter("gen", e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Todas las generaciones</option>
            {options.gens.map((g) => <option key={g} value={g}>Generación {g}</option>)}
          </select>
          <select
            aria-label="Color" className={selectClass}
            value={shown(options.colors, filters.color)}
            onChange={(e) => setFilter("color", e.target.value || undefined)}
          >
            <option value="">Cualquier color</option>
            {options.colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            aria-label="Egg group" className={selectClass}
            value={shown(options.eggGroups, filters.eggGroup)}
            onChange={(e) => setFilter("eggGroup", e.target.value || undefined)}
          >
            <option value="">Cualquier egg group</option>
            {options.eggGroups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select
            aria-label="Ordenar por" className={selectClass}
            value={sort}
            onChange={(e) => setSort(e.target.value as SpeciesSort)}
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Ordenar: {o.label}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-footnote text-muted-foreground">
            <input
              type="checkbox"
              checked={!!filters.onlyLegal}
              onChange={(e) => setFilters((f) => ({ ...f, onlyLegal: e.target.checked || undefined }))}
            />
            Solo legales en la liga
          </label>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ onlyLegal: f.onlyLegal }))}
              className="text-footnote text-primary underline-offset-2 hover:underline"
            >
              Limpiar filtros ({activeCount})
            </button>
          )}
        </div>

        {matches.length > MAX_RESULTS && (
          <p className="text-caption text-muted-foreground">
            Mostrando {MAX_RESULTS} de {matches.length}: afina la búsqueda para ver el resto.
          </p>
        )}

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
