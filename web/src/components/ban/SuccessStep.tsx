import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { PokeResult } from "@/lib/pokeapi";

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

interface Props {
  pokemon: PokeResult;
}

export function SuccessStep({ pokemon }: Props) {
  return (
    <Card className="w-full max-w-sm shadow-sm">
      <CardHeader className="pb-2 items-center text-center">
        <div className="w-10 h-10 rounded-full bg-green-900/40 flex items-center justify-center mb-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 text-green-400"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <CardTitle className="text-xl font-semibold tracking-tight">
          Ban registrado
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Tu voto ha sido contado de forma anónima.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        <Separator />

        <img
          src={pokemon.sprite}
          alt={pokemon.displayName}
          className="w-28 h-28 object-contain"
        />

        <div className="flex flex-col items-center gap-1.5">
          <span className="font-medium text-base leading-none">
            {pokemon.displayName}
          </span>
          <span className="text-xs text-muted-foreground">
            #{String(pokemon.id).padStart(4, "0")}
          </span>
          <div className="flex gap-1.5 flex-wrap justify-center mt-0.5">
            {pokemon.types.split(" / ").map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className={`text-xs px-2 ${TYPE_COLORS[t] ?? ""}`}
              >
                {t}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Los bans se revelarán cuando todos los jugadores hayan votado.
        </p>
      </CardContent>
    </Card>
  );
}
