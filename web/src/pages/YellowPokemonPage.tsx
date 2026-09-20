import { useState, useEffect, useMemo } from "react";
import { Input }  from "@/components/ui/input";
import { Badge }  from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ────────────────────────────────────────────────────────────────────

interface YellowPokemon {
  num: number;
  name: string;
  slug: string;
  types: string[];
  eggGroups: string[];
  bst: number;
  gen: number;
  category: "regular" | "pseudo" | "sub-legendary" | "restricted-legendary" | "mythical" | "ultra-beast" | "paradox";
  meetsC2: boolean;
  meetsC3: boolean;
  sprite: string;
}

type FilterKey = "all" | "free" | "slot" | "banned";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Normal:   "bg-zinc-700/60   text-zinc-200",
  Fire:     "bg-orange-900/60 text-orange-300",
  Water:    "bg-blue-900/60   text-blue-300",
  Electric: "bg-yellow-800/60 text-yellow-300",
  Grass:    "bg-green-900/60  text-green-300",
  Ice:      "bg-cyan-900/60   text-cyan-300",
  Fighting: "bg-red-900/60    text-red-300",
  Poison:   "bg-purple-900/60 text-purple-300",
  Ground:   "bg-amber-900/60  text-amber-300",
  Flying:   "bg-indigo-900/60 text-indigo-300",
  Psychic:  "bg-pink-900/60   text-pink-300",
  Bug:      "bg-lime-900/60   text-lime-300",
  Rock:     "bg-stone-700/60  text-stone-300",
  Ghost:    "bg-violet-900/60 text-violet-300",
  Dragon:   "bg-indigo-800/60 text-indigo-200",
  Dark:     "bg-zinc-800/60   text-zinc-300",
  Steel:    "bg-slate-700/60  text-slate-300",
  Fairy:    "bg-rose-900/60   text-rose-300",
};

const CATEGORY_LABEL: Record<YellowPokemon["category"], string> = {
  "regular":              "Libre",
  "pseudo":               "Pseudo",
  "sub-legendary":        "Sub-Leg.",
  "restricted-legendary": "Legendario",
  "mythical":             "Mítico",
  "ultra-beast":          "Ultra Beast",
  "paradox":              "Paradox",
};

const CATEGORY_STYLE: Record<YellowPokemon["category"], string> = {
  "regular":              "bg-zinc-700/50   text-zinc-300   border-zinc-600",
  "pseudo":               "bg-amber-900/50  text-amber-300  border-amber-700",
  "sub-legendary":        "bg-blue-900/50   text-blue-300   border-blue-700",
  "restricted-legendary": "bg-purple-900/50 text-purple-300 border-purple-700",
  "mythical":             "bg-pink-900/50   text-pink-300   border-pink-700",
  "ultra-beast":          "bg-red-900/50    text-red-300    border-red-700",
  "paradox":              "bg-orange-900/50 text-orange-300 border-orange-700",
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",    label: "Todos" },
  { key: "free",   label: "Sin restricción" },
  { key: "slot",   label: "Slot especial" },
  { key: "banned", label: "Baneados" },
];

function matchesFilter(p: YellowPokemon, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "free")   return p.category === "regular" || p.category === "pseudo";
  if (filter === "banned") return p.category === "ultra-beast";
  // slot = everything else
  return ["sub-legendary", "restricted-legendary", "mythical", "paradox"].includes(p.category);
}

// ── Card ──────────────────────────────────────────────────────────────────────

function PokemonCard({ p }: { p: YellowPokemon }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError]   = useState(false);

  return (
    <Card className="overflow-hidden transition-colors hover:bg-muted/40 border-border/60">
      <CardContent className="p-3 flex flex-col gap-2">

        {/* Sprite */}
        <div className="relative w-full aspect-square flex items-center justify-center bg-muted/30 rounded-md overflow-hidden">
          {!imgLoaded && !imgError && (
            <Skeleton className="absolute inset-0 rounded-md" />
          )}
          {!imgError ? (
            <img
              src={p.sprite}
              alt={p.name}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgError(true); setImgLoaded(true); }}
              className={`w-full h-full object-contain transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            />
          ) : (
            <span className="text-3xl select-none">?</span>
          )}
        </div>

        {/* Name + Dex # */}
        <div className="flex items-baseline justify-between gap-1">
          <span className="font-semibold text-sm leading-tight truncate">{p.name}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            #{String(p.num).padStart(4, "0")}
          </span>
        </div>

        {/* Types */}
        <div className="flex flex-wrap gap-1">
          {p.types.map(t => (
            <Badge
              key={t}
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[t] ?? ""}`}
            >
              {t}
            </Badge>
          ))}
        </div>

        {/* Category */}
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 w-fit ${CATEGORY_STYLE[p.category]}`}
        >
          {CATEGORY_LABEL[p.category]}
        </Badge>

        {/* Tournament conditions */}
        {(p.meetsC2 || p.meetsC3) && (
          <div className="flex flex-wrap gap-1 pt-0.5 border-t border-border/40">
            {p.meetsC2 && (
              <span className="text-[10px] text-emerald-400 font-medium">✓ Gen 5</span>
            )}
            {p.meetsC3 && (
              <span className="text-[10px] text-emerald-400 font-medium">✓ Egg:Dragon</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function YellowPokemonPage() {
  const [data,    setData]    = useState<YellowPokemon[]>([]);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState("");
  const [filter,  setFilter]  = useState<FilterKey>("all");

  useEffect(() => {
    fetch("/yellow-pokemon.json")
      .then(r => r.json())
      .then((d: YellowPokemon[]) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return data.filter(p =>
      matchesFilter(p, filter) &&
      (!q || p.name.toLowerCase().includes(q) || String(p.num).includes(q))
    );
  }, [data, query, filter]);

  const counts = useMemo(() => ({
    all:    data.length,
    free:   data.filter(p => matchesFilter(p, "free")).length,
    slot:   data.filter(p => matchesFilter(p, "slot")).length,
    banned: data.filter(p => matchesFilter(p, "banned")).length,
  }), [data]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <span className="text-yellow-400">◆</span>
            Pokémon Amarillos
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Cargando…" : `${data.length} Pokémon con color principal Amarillo — válidos para la condición C4 del Torneo #02`}
          </p>
        </div>

        {/* Condiciones del torneo */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded-md bg-yellow-900/30 text-yellow-300 border border-yellow-800/50 font-medium">
            C4 · Color Amarillo ← todos estos
          </span>
          <span className="px-2 py-1 rounded-md bg-emerald-900/30 text-emerald-300 border border-emerald-800/50 font-medium">
            C2 · Gen 5 (marcados)
          </span>
          <span className="px-2 py-1 rounded-md bg-emerald-900/30 text-emerald-300 border border-emerald-800/50 font-medium">
            C3 · Egg Group Dragón (marcados)
          </span>
        </div>

        {/* Controles */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Buscar por nombre o #..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <Button
                key={f.key}
                variant={filter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f.key)}
                className="text-xs h-8"
              >
                {f.label}
                <span className="ml-1.5 opacity-60">
                  {counts[f.key]}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-3 flex flex-col gap-2">
                  <Skeleton className="w-full aspect-square rounded-md" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">
            Sin resultados para "{query}"
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map(p => <PokemonCard key={p.num} p={p} />)}
          </div>
        )}

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Mostrando {filtered.length} de {data.length} Pokémon
          </p>
        )}
      </div>
    </div>
  );
}
