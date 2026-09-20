import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { searchPokemon, getPokemonDetail, type PokeResult } from "@/lib/pokeapi";

interface Props {
  onSelect: (pokemon: PokeResult) => void;
}

/* Colores dark-mode: fondo sutil + texto saturado visible sobre negro Apple */
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

export function SearchStep({ onSelect }: Props) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<PokeResult[]>([]);
  const [loading, setLoading]   = useState(false);

  const fetchDetails = useCallback(async (q: string) => {
    const matches = searchPokemon(q, 12);
    if (matches.length === 0) { setResults([]); return; }

    setLoading(true);
    const details = await Promise.all(matches.map((m) => getPokemonDetail(m.id)));
    setResults(details);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchDetails(query), 250);
    return () => clearTimeout(t);
  }, [query, fetchDetails]);

  return (
    <Card className="w-full max-w-sm shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-semibold tracking-tight">
          Elige tu ban
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Busca el Pokémon que deseas banear del torneo.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Buscar Pokémon…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
        />

        {loading && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Buscando…
          </p>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Sin resultados para "{query}"
          </p>
        )}

        {results.length > 0 && (
          <div className="flex flex-col gap-1 max-h-[420px] overflow-y-auto -mx-1 px-1">
            {results.map((p, i) => (
              <div key={p.id}>
                <button
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                >
                  {/* Sprite */}
                  <img
                    src={p.sprite}
                    alt={p.displayName}
                    className="w-12 h-12 object-contain flex-shrink-0"
                    loading="lazy"
                  />

                  {/* Info */}
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm leading-none">
                        {p.displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        #{String(p.id).padStart(4, "0")}
                      </span>
                    </div>

                    <div className="flex gap-1 flex-wrap">
                      {p.types.split(" / ").map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className={`text-xs px-1.5 py-0 ${TYPE_COLORS[t] ?? ""}`}
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </button>

                {i < results.length - 1 && (
                  <Separator className="my-0.5 opacity-50" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
